/**
 * GPU-accelerated cymatics simulation using WebGL ping-pong render targets.
 *
 * Architecture:
 *  - Two NxN RGBA HalfFloat render targets store particle state (x, y, vx, vy)
 *  - Each frame a simulation shader reads state from target A, writes to target B
 *  - A render shader reads positions from the latest target and draws glowing points
 *
 * Plate shapes:
 *  0 = square   — sin(mπx)·sin(nπy)  rectangular modes
 *  1 = circle   — sin(mπr/R)·cos(nθ) radial × azimuthal modes
 *  2 = triangle  ⎫
 *  3 = pentagon  ⎬ — sector-folded modes: fold θ into one N-symmetry sector,
 *  4 = hexagon   ⎬   apply sin(mπr/R)·sin(nπ·θ_norm) inside the sector
 *  5 = octagon   ⎭
 *
 * Boundary enforcement (all shapes):
 *  SDF-based repulsion + hard projection so particles never escape.
 *  The SDF for N-gons places one vertex at the top (90°) via a precomputed rotation.
 *
 * Coloring:
 *  Each active mode stores its own RGB colour (from noteToRGB).
 *  The render vertex shader blends mode colours weighted by the gradient magnitude
 *  of each mode's field at the particle's current position — particles sitting on
 *  nodal lines of mode-i (where grad-i is largest) take on mode-i's colour.
 */
import * as THREE from 'three';
import { noteToRGB } from './colorMapping';
import type { PlateShape } from '../types';

// ─── Shape index mapping ──────────────────────────────────────────────────────

const SHAPE_INDEX: Record<PlateShape, number> = {
  square:   0,
  circle:   1,
  triangle: 2,
  pentagon: 3,
  hexagon:  4,
  octagon:  5,
};

// Per-shape geometry constants (used in both GLSL and JS seed generation)
// inradius = distance from center to nearest edge midpoint
const SHAPE_INRADIUS = [0.45, 0.43, 0.22, 0.36, 0.41, 0.42];
// nsides (0 & 1 unused for polygon SDF)
const SHAPE_NSIDES   = [4,    0,    3,    5,    6,    8  ];
// PLATE_R = circumradius used to normalise r in mode equations
const SHAPE_PLATE_R  = [0.45, 0.43, 0.44, 0.44, 0.47, 0.46];

// ─── Shaders ──────────────────────────────────────────────────────────────────

const SIM_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Shared GLSL helpers injected into both sim and render shaders via string concat
const GLSL_SHAPE_HELPERS = /* glsl */`
#define PI 3.14159265358979

// ── SDF functions ─────────────────────────────────────────────────────────────

// Rotate a 2-D vector by angle a
vec2 rot2(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c*v.x - s*v.y, s*v.x + c*v.y);
}

// Regular N-gon SDF (negative = inside).
// Vertex count n, inradius (apothem) r.
// One vertex is placed at 90° (top of screen) via rotation.
float sdfNgon(vec2 c, float n, float r) {
  float rotAngle = PI * 0.5 - PI / n;  // rotate so first vertex points up
  vec2  rc = rot2(c, -rotAngle);
  float angle = atan(rc.y, rc.x);
  float k = 2.0 * PI / n;
  return cos(floor(0.5 + angle / k) * k - angle) * length(rc) - r;
}

float plateSDF(vec2 pos, int shape) {
  vec2 c = pos - 0.5;
  if (shape == 0) { vec2 d = abs(c) - 0.45; return max(d.x, d.y); }
  if (shape == 1) { return length(c) - 0.43; }
  if (shape == 2) { return sdfNgon(c, 3.0, 0.22); }
  if (shape == 3) { return sdfNgon(c, 5.0, 0.36); }
  if (shape == 4) { return sdfNgon(c, 6.0, 0.41); }
                    return sdfNgon(c, 8.0, 0.42);
}

// Numerical outward-normal of the SDF at pos
vec2 sdfNormal(vec2 pos, int shape) {
  float e = 0.004;
  vec2 n = vec2(
    plateSDF(pos + vec2(e,0), shape) - plateSDF(pos - vec2(e,0), shape),
    plateSDF(pos + vec2(0,e), shape) - plateSDF(pos - vec2(0,e), shape)
  );
  float len = length(n);
  return len > 1e-5 ? n / len : vec2(0.0);
}

// ── Vibration-field per mode ──────────────────────────────────────────────────

float vibFieldOne(vec2 pos, float m, float n, int shape, float plateR) {
  vec2  c     = pos - 0.5;
  float r     = length(c);
  float theta = atan(c.y, c.x);
  float rn    = min(r / plateR, 1.0);

  if (shape == 0) {
    return sin(m * PI * pos.x) * sin(n * PI * pos.y);
  }
  if (shape == 1) {
    return sin(m * PI * rn) * cos(n * theta);
  }

  // Polygon: fold angle into one sector (2-fold mirror → use sin for angular)
  float ns = (shape == 2) ? 3.0
           : (shape == 3) ? 5.0
           : (shape == 4) ? 6.0 : 8.0;
  float rotAngle = PI * 0.5 - PI / ns;
  vec2  rc = rot2(c, -rotAngle);
  float thr = atan(rc.y, rc.x);     // angle in rotated frame
  float sa  = 2.0 * PI / ns;         // full sector angle
  float ft  = mod(thr + PI, sa);     // fold into [0, sa)
  if (ft > sa * 0.5) ft = sa - ft;   // mirror → [0, sa/2]
  float tn  = ft / (sa * 0.5);       // normalise to [0, 1]
  return sin(m * PI * rn) * sin(n * PI * tn);
}
`;

// ─────────────────────────────────────────────────────────────────────────────

const SIM_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;

uniform sampler2D uState;
uniform float uForce;
uniform float uFriction;
uniform float uDt;
uniform float uNoise;
uniform float uSpreadNoise;
uniform float uEdgeRepulsion;
uniform float uTime;
uniform int   uPlateShape;
uniform float uPlateR;
uniform vec3  uModes[8];

` + GLSL_SHAPE_HELPERS + `

float vibField(vec2 pos) {
  float v = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = uModes[i].z;
    if (a < 0.001) continue;
    v += a * vibFieldOne(pos, uModes[i].x, uModes[i].y, uPlateShape, uPlateR);
  }
  return v;
}

vec2 vibGrad(vec2 pos) {
  float e  = 0.003;
  float v0 = vibField(pos);
  return vec2(
    (vibField(pos + vec2(e, 0.0)) - v0) / e,
    (vibField(pos + vec2(0.0, e)) - v0) / e
  );
}

float hash(vec2 co) {
  return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 state = texture2D(uState, vUv);
  vec2 pos = state.xy;
  vec2 vel = state.zw;

  // ── Vibration force ───────────────────────────────────────────────────────
  vec2 force = -vibGrad(pos) * uForce;

  // ── Spread noise (amplified when plate is quiet) ──────────────────────────
  float fieldEnergy = 0.0;
  for (int i = 0; i < 8; i++) fieldEnergy += uModes[i].z;
  float quietness = 1.0 - clamp(fieldEnergy / 3.0, 0.0, 1.0);
  float effNoise   = uNoise + uSpreadNoise * quietness;
  float r1 = (hash(vUv + uTime * 0.07)         - 0.5) * 2.0;
  float r2 = (hash(vUv + uTime * 0.07 + 0.371) - 0.5) * 2.0;
  force += vec2(r1, r2) * effNoise;

  // ── Plate-boundary repulsion (SDF-based, works for all shapes) ────────────
  float sd     = plateSDF(pos, uPlateShape);
  float margin = 0.06;
  if (sd > -margin) {
    vec2 inward = -sdfNormal(pos, uPlateShape);
    force += inward * ((sd + margin) / margin) * uEdgeRepulsion;
  }

  // ── Integrate ─────────────────────────────────────────────────────────────
  vel += force * uDt;
  vel *= uFriction;
  pos += vel * uDt;

  // ── Hard correction — project back if escaped ─────────────────────────────
  float sd2 = plateSDF(pos, uPlateShape);
  if (sd2 > 0.0) {
    vec2 norm = sdfNormal(pos, uPlateShape);
    pos -= norm * (sd2 + 0.001);
    float vn = dot(vel, norm);
    if (vn > 0.0) vel -= norm * vn * 1.3;
  }

  gl_FragColor = vec4(pos, vel);
}
`;

// ─────────────────────────────────────────────────────────────────────────────

const RENDER_VERT = /* glsl */`
attribute vec2  aParticleUV;
uniform sampler2D uState;
uniform vec3  uModes[8];
uniform vec3  uModeColors[8];
uniform float uPointSize;
uniform int   uPlateShape;
uniform float uPlateR;

varying vec3  vColor;
varying float vBright;
varying float vInsidePlate;

` + GLSL_SHAPE_HELPERS + `

void main() {
  vec4  state = texture2D(uState, aParticleUV);
  vec2  pos   = state.xy;
  float speed = length(state.zw);

  vBright      = 0.55 + clamp(speed * 3.0, 0.0, 0.45);
  float sd     = plateSDF(pos, uPlateShape);
  vInsidePlate = clamp(-sd / 0.025, 0.0, 1.0);  // soft fade at boundary

  // Gradient-magnitude-weighted colour blend across all active modes
  float e           = 0.004;
  float totalWeight = 0.0;
  vec3  blended     = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    float a = uModes[i].z;
    if (a < 0.001) continue;

    float m  = uModes[i].x;
    float n  = uModes[i].y;
    float f0 = vibFieldOne(pos,               m, n, uPlateShape, uPlateR);
    float fx = vibFieldOne(pos + vec2(e,0.0), m, n, uPlateShape, uPlateR);
    float fy = vibFieldOne(pos + vec2(0.0,e), m, n, uPlateShape, uPlateR);
    float gMag = length(vec2(fx - f0, fy - f0)) / e;
    float w    = a * gMag;
    blended     += uModeColors[i] * w;
    totalWeight += w;
  }

  if (totalWeight > 0.001) {
    vColor = blended / totalWeight;
  } else {
    // Fallback: colour of the highest-amplitude active mode
    vec3 fb = vec3(0.5, 0.7, 1.0);
    bool found = false;
    for (int i = 7; i >= 0; i--) {
      if (!found && uModes[i].z > 0.001) { fb = uModeColors[i]; found = true; }
    }
    vColor = fb;
  }

  gl_Position  = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
}
`;

const RENDER_FRAG = /* glsl */`
precision mediump float;
varying vec3  vColor;
varying float vBright;
varying float vInsidePlate;

void main() {
  if (vInsidePlate < 0.01) discard;

  vec2  uv   = gl_PointCoord - 0.5;
  float dist = length(uv);
  if (dist > 0.5) discard;

  float core  = 1.0 - smoothstep(0.0, 0.2, dist);
  float halo  = 1.0 - smoothstep(0.2, 0.5, dist);
  float alpha = mix(halo * 0.6, 1.0, core) * vBright * vInsidePlate;

  gl_FragColor = vec4(vColor, alpha);
}
`;

// ─── Texture resolution → particle count ─────────────────────────────────────
const SIZES: Record<number, number> = {
  128: 128,
  256: 256,
  512: 512,
};

interface Mode {
  m: number;
  n: number;
  amplitude: number;
  decayRate: number;
  r: number;
  g: number;
  b: number;
}

function noteToMode(midiNote: number): [number, number] {
  const t        = (midiNote - 21) / 87;
  const semitone = midiNote % 12;
  const modeMap: Record<number, [number, number]> = {
    0:  [1, 1], 1:  [2, 1], 2: [1, 2], 3: [3, 2], 4: [2, 3],
    5:  [3, 1], 6:  [1, 3], 7: [4, 3], 8: [3, 4], 9: [4, 1],
    10: [2, 5], 11: [5, 2],
  };
  const [bm, bn] = modeMap[semitone];
  const scale    = 1 + Math.floor(t * 3);
  return [bm * scale, bn * scale];
}

export class CymaticsEngine {
  private renderer: THREE.WebGLRenderer;
  private scene:    THREE.Scene;
  private camera:   THREE.OrthographicCamera;

  private simScene!:    THREE.Scene;
  private simCamera!:   THREE.OrthographicCamera;
  private simMaterial!: THREE.ShaderMaterial;
  private targets!: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private current = 0;

  private renderMaterial!: THREE.ShaderMaterial;
  private points!:         THREE.Points;
  private particleGeo!:    THREE.BufferGeometry;

  private modes: Mode[] = [];
  private time  = 0;

  private textureSize:   number;
  private particleCount: number;
  private plateShapeIndex = 0;

  // ── Adjustable parameters ─────────────────────────────────────────────────
  pointSize        = 2.5;
  force            = 0.9;
  friction         = 0.965;
  noise            = 0.0012;
  spreadNoise      = 0.006;
  edgeRepulsion    = 0.04;
  releaseDecayRate = 0.008;

  constructor(canvas: HTMLCanvasElement, texSize = 256) {
    this.textureSize   = SIZES[texSize] ?? 256;
    this.particleCount = this.textureSize * this.textureSize;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x05050f, 1);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

    this.initSimulation();
    this.initRenderPass();
  }

  // ─── Init ────────────────────────────────────────────────────────────────

  private createTarget() {
    return new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, {
      minFilter:   THREE.NearestFilter,
      magFilter:   THREE.NearestFilter,
      format:      THREE.RGBAFormat,
      type:        THREE.HalfFloatType,
      depthBuffer: false,
    });
  }

  private initSimulation(initData?: Float32Array) {
    this.targets = [this.createTarget(), this.createTarget()];

    const N    = this.textureSize;
    const data = initData ?? this.generateSeededPositions();

    const initTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
    initTex.needsUpdate = true;

    this.simMaterial = new THREE.ShaderMaterial({
      vertexShader:   SIM_VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uState:         { value: initTex },
        uForce:         { value: this.force },
        uFriction:      { value: this.friction },
        uDt:            { value: 0.016 },
        uNoise:         { value: this.noise },
        uSpreadNoise:   { value: this.spreadNoise },
        uEdgeRepulsion: { value: this.edgeRepulsion },
        uTime:          { value: 0 },
        uPlateShape:    { value: this.plateShapeIndex },
        uPlateR:        { value: SHAPE_PLATE_R[this.plateShapeIndex] },
        uModes:         { value: Array.from({ length: 8 }, () => new THREE.Vector3(1, 1, 0)) },
      },
    });

    this.simScene  = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial));

    // Prime both targets
    this.renderer.setRenderTarget(this.targets[0]);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(this.targets[1]);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(null);
  }

  private initRenderPass() {
    const N     = this.textureSize;
    const count = this.particleCount;

    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      uvs[i * 2]     = ((i % N) + 0.5) / N;
      uvs[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N;
    }

    const dummyPos = new Float32Array(count * 3);
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position',    new THREE.BufferAttribute(dummyPos, 3));
    this.particleGeo.setAttribute('aParticleUV', new THREE.BufferAttribute(uvs, 2));

    this.renderMaterial = new THREE.ShaderMaterial({
      vertexShader:   RENDER_VERT,
      fragmentShader: RENDER_FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      uniforms: {
        uState:      { value: null },
        uModes:      { value: Array.from({ length: 8 }, () => new THREE.Vector3(1, 1, 0)) },
        uModeColors: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0.5, 0.7, 1.0)) },
        uPointSize:  { value: this.pointSize },
        uPlateShape: { value: this.plateShapeIndex },
        uPlateR:     { value: SHAPE_PLATE_R[this.plateShapeIndex] },
      },
    });

    this.points = new THREE.Points(this.particleGeo, this.renderMaterial);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  // ─── Seed generation ─────────────────────────────────────────────────────

  /** Generate random particle positions inside the current plate shape. */
  private generateSeededPositions(): Float32Array {
    const N    = this.textureSize;
    const data = new Float32Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      let x = 0.5, y = 0.5;
      let attempts = 0;
      do {
        x = Math.random();
        y = Math.random();
        attempts++;
      } while (this.jsSDF(x, y) > 0 && attempts < 150);
      data[i * 4]     = x;
      data[i * 4 + 1] = y;
    }
    return data;
  }

  /** JS mirror of the GLSL plateSDF for seed rejection-sampling. */
  private jsSDF(px: number, py: number): number {
    const cx = px - 0.5, cy = py - 0.5;
    const idx = this.plateShapeIndex;
    if (idx === 0) return Math.max(Math.abs(cx) - 0.45, Math.abs(cy) - 0.45);
    if (idx === 1) return Math.sqrt(cx * cx + cy * cy) - 0.43;
    const n   = SHAPE_NSIDES[idx];
    const r   = SHAPE_INRADIUS[idx];
    // Rotate so first vertex points up
    const rot = Math.PI / 2 - Math.PI / n;
    const rca = Math.cos(-rot), rsa = Math.sin(-rot);
    const rcx = rca * cx - rsa * cy;
    const rcy = rsa * cx + rca * cy;
    const angle = Math.atan2(rcy, rcx);
    const k = 2 * Math.PI / n;
    return Math.cos(Math.floor(0.5 + angle / k) * k - angle) * Math.sqrt(rcx * rcx + rcy * rcy) - r;
  }

  /** Re-seed both render targets with positions inside the current plate shape. */
  private resetParticles() {
    const N    = this.textureSize;
    const data = this.generateSeededPositions();
    const tex  = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;

    this.simMaterial.uniforms.uState.value = tex;
    this.renderer.setRenderTarget(this.targets[0]);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(this.targets[1]);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(null);
    this.current = 0;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  addNote(midiNote: number, velocity = 80) {
    const [r, g, b] = noteToRGB(midiNote);
    const [m, n]    = noteToMode(midiNote);
    const amplitude = 0.5 + (velocity / 127) * 1.5;

    const existing = this.modes.findIndex(mo => mo.m === m && mo.n === n);
    const mode: Mode = { m, n, amplitude, decayRate: 0.002, r, g, b };

    if (existing >= 0) {
      this.modes[existing] = mode;
    } else {
      if (this.modes.length >= 8) this.modes.shift();
      this.modes.push(mode);
    }
    this.flushModeUniforms();
  }

  releaseNote(midiNote: number) {
    const [m, n] = noteToMode(midiNote);
    const idx    = this.modes.findIndex(mo => mo.m === m && mo.n === n);
    if (idx >= 0) this.modes[idx].decayRate = this.releaseDecayRate;
  }

  setPlateShape(shape: PlateShape) {
    const idx = SHAPE_INDEX[shape];
    if (idx === this.plateShapeIndex) return;
    this.plateShapeIndex = idx;

    const plateR = SHAPE_PLATE_R[idx];
    this.simMaterial.uniforms.uPlateShape.value    = idx;
    this.simMaterial.uniforms.uPlateR.value        = plateR;
    this.renderMaterial.uniforms.uPlateShape.value = idx;
    this.renderMaterial.uniforms.uPlateR.value     = plateR;

    this.resetParticles();
  }

  setPointSize       (v: number) { this.pointSize        = v; }
  setForce           (v: number) { this.force            = v; this.simMaterial.uniforms.uForce.value          = v; }
  setFriction        (v: number) { this.friction         = v; this.simMaterial.uniforms.uFriction.value       = v; }
  setNoise           (v: number) { this.noise            = v; this.simMaterial.uniforms.uNoise.value           = v; }
  setSpreadNoise     (v: number) { this.spreadNoise      = v; this.simMaterial.uniforms.uSpreadNoise.value     = v; }
  setEdgeRepulsion   (v: number) { this.edgeRepulsion    = v; this.simMaterial.uniforms.uEdgeRepulsion.value   = v; }
  setReleaseDecayRate(v: number) { this.releaseDecayRate = v; }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h);
  }

  update(dt: number) {
    this.time += dt;

    this.simMaterial.uniforms.uForce.value         = this.force;
    this.simMaterial.uniforms.uFriction.value      = this.friction;
    this.simMaterial.uniforms.uNoise.value         = this.noise;
    this.simMaterial.uniforms.uSpreadNoise.value   = this.spreadNoise;
    this.simMaterial.uniforms.uEdgeRepulsion.value = this.edgeRepulsion;
    this.simMaterial.uniforms.uTime.value          = this.time;
    this.simMaterial.uniforms.uDt.value            = Math.min(dt, 0.033);

    // Decay mode amplitudes
    for (let i = this.modes.length - 1; i >= 0; i--) {
      this.modes[i].amplitude -= this.modes[i].decayRate;
      if (this.modes[i].amplitude <= 0) this.modes.splice(i, 1);
    }
    this.flushModeUniforms();

    const src = this.targets[this.current];
    const dst = this.targets[1 - this.current];

    // Simulation pass
    this.simMaterial.uniforms.uState.value = src.texture;
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.simScene, this.simCamera);
    this.current = 1 - this.current;

    // Render pass
    this.renderMaterial.uniforms.uState.value     = this.targets[this.current].texture;
    this.renderMaterial.uniforms.uPointSize.value = this.pointSize * this.renderer.getPixelRatio();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.targets[0].dispose();
    this.targets[1].dispose();
    this.simMaterial.dispose();
    this.renderMaterial.dispose();
    this.particleGeo.dispose();
    this.renderer.dispose();
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private flushModeUniforms() {
    const simVecs    = this.simMaterial.uniforms.uModes.value    as THREE.Vector3[];
    const renderVecs = this.renderMaterial.uniforms.uModes.value as THREE.Vector3[];
    const colors     = this.renderMaterial.uniforms.uModeColors.value as THREE.Vector3[];

    for (let i = 0; i < 8; i++) {
      const mo = this.modes[i];
      simVecs[i].set(   mo?.m ?? 1, mo?.n ?? 1, mo?.amplitude ?? 0);
      renderVecs[i].set(mo?.m ?? 1, mo?.n ?? 1, mo?.amplitude ?? 0);
      colors[i].set(    mo?.r ?? 0.5, mo?.g ?? 0.7, mo?.b ?? 1.0);
    }
  }
}
