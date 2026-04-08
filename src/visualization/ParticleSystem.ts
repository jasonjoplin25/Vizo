import * as THREE from 'three';
import { noteToRGB } from './colorMapping';

// ─── Effect type ──────────────────────────────────────────────────────────────

export type ParticleEffect =
  | 'default'
  | 'fireworks'
  | 'dance'
  | 'spiral'
  | 'fountain'
  | 'comet'
  | 'confetti'
  | 'orbit';

export const EFFECT_LABELS: Record<ParticleEffect, string> = {
  default:   'Rise',
  fireworks: 'Fireworks',
  dance:     'Dance',
  spiral:    'Spiral',
  fountain:  'Fountain',
  comet:     'Comet',
  confetti:  'Confetti',
  orbit:     'Orbit',
};

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
attribute float aOpacity;
attribute vec3  aColor;
uniform   float uPointSize;

varying float vOpacity;
varying vec3  vColor;

void main() {
  vOpacity = aOpacity;
  vColor   = aColor;
  gl_PointSize = uPointSize;
  gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
varying float vOpacity;
varying vec3  vColor;

void main() {
  vec2  uv   = gl_PointCoord - 0.5;
  float dist = length(uv);
  if (dist > 0.5) discard;

  float core   = 1.0 - smoothstep(0.0,  0.25, dist);
  float fringe = 1.0 - smoothstep(0.25, 0.5,  dist);
  float alpha  = mix(fringe, 1.0, core) * vOpacity;

  gl_FragColor = vec4(vColor, alpha);
}
`;

// ─── Particle pool ────────────────────────────────────────────────────────────

const MAX_PARTICLES = 16000;

/**
 * Internal particle state.
 *
 * Coordinate system:
 *   y = 0   → top of screen
 *   y = h   → bottom of screen (keys live here)
 *   vy < 0  → moving upward
 *
 * Extra fields are reused per-effect:
 *   phase   – oscillation / orbit angle (radians)
 *   originX – spawn or orbit centre X
 *   originY – dance / orbit target Y
 *   orbitR  – orbit or spiral radius (px)
 *   ay      – per-frame Y acceleration (gravity) or orbital angular velocity
 *   exploded – fireworks: has the note-off explosion fired?
 *   midi    – source MIDI note (for per-note colouring / fireworks trigger)
 */
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  r: number; g: number; b: number;
  active: boolean;
  midi: number;
  phase: number;
  originX: number;
  originY: number;
  orbitR: number;
  ay: number;
  exploded: boolean;
}

interface Emitter {
  xNorm: number;
  midi: number;
  velocity: number;
}

// ─── ParticleSystem ───────────────────────────────────────────────────────────

export class ParticleSystem {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.ShaderMaterial;
  private points!: THREE.Points;

  private positions!: Float32Array;
  private opacities!: Float32Array;
  private colors!: Float32Array;

  private pool: Particle[];
  private active: Particle[] = [];
  private activeEmitters = new Map<number, Emitter>();

  private width  = 1;
  private height = 1;

  // ── Shared knobs ─────────────────────────────────────────────────────────
  pointSize  = 3;
  emitRate   = 4;
  burstCount = 20;
  riseSpeed  = 2.0;
  spread     = 0.018;
  lifetime   = 220;
  effect: ParticleEffect = 'default';

  // ── Fireworks knobs ───────────────────────────────────────────────────────
  /** Base explosion speed (px/frame). */
  fireworksExplosionSpeed = 5.0;

  // ── Dance knobs ───────────────────────────────────────────────────────────
  /** Y target as fraction of canvas height (0 = top, 1 = bottom). */
  danceTargetY    = 0.45;
  /** Phase advance per frame (controls dance speed). */
  danceSpeed      = 0.055;
  /** Peak horizontal sway amplitude (px). */
  danceAmplitude  = 1.6;
  /** Peak vertical oscillation range (px, ±half around target). */
  danceVertical   = 28;

  // ── Spiral knobs ──────────────────────────────────────────────────────────
  /** Rotation per frame (radians). */
  spiralRotSpeed  = 0.05;
  /** Radius expansion per frame (px). */
  spiralExpand    = 0.22;
  /** Maximum spiral radius (px). */
  spiralMaxRadius = 58;

  // ── Fountain knobs ────────────────────────────────────────────────────────
  /** Downward acceleration per frame (px/frame²). */
  fountainGravity = 0.065;
  /** Max horizontal launch speed (px/frame). */
  fountainSpread  = 5.0;

  // ── Comet knobs ───────────────────────────────────────────────────────────
  /** Speed multiplier applied to comet velocity. */
  cometSpeed      = 1.0;
  /** Average comet lifetime (frames). */
  cometLifetime   = 65;

  // ── Confetti knobs ────────────────────────────────────────────────────────
  /** Horizontal sway amplitude (px). */
  confettiDrift   = 1.4;
  /** Downward pull per frame² (px). */
  confettiGravity = 0.012;
  /** Average confetti lifetime (frames). */
  confettiLifetime = 380;

  // ── Orbit knobs ───────────────────────────────────────────────────────────
  /** Base orbit radius (px). Grows with MIDI note number. */
  orbitRadius  = 22;
  /** Base angular velocity (rad/frame). */
  orbitSpeed   = 0.022;
  /** Vertical compression factor (1 = circle, < 1 = ellipse). */
  orbitEllipse = 0.42;
  /** Orbit centre Y as fraction of canvas height. */
  orbitTargetY = 0.38;

  // ─────────────────────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.camera.position.z = 1;

    this.pool = Array.from({ length: MAX_PARTICLES }, () => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, decay: 0, r: 1, g: 1, b: 1, active: false,
      midi: 0, phase: 0, originX: 0, originY: 0,
      orbitR: 0, ay: 0, exploded: false,
    }));

    this.initGeometry();
  }

  private initGeometry() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.opacities  = new Float32Array(MAX_PARTICLES);
    this.colors     = new Float32Array(MAX_PARTICLES * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aOpacity', new THREE.BufferAttribute(this.opacities,  1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor',   new THREE.BufferAttribute(this.colors,     3).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      uniforms:       { uPointSize: { value: this.pointSize } },
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  resize(w: number, h: number) {
    this.width  = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.camera.right = w;
    this.camera.top   = h;
    this.camera.updateProjectionMatrix();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  activateNote(midi: number, xNorm: number, velocity = 80) {
    this.activeEmitters.set(midi, { xNorm, midi, velocity });
    this.spawnN(this.burstCount, xNorm, midi, velocity, true);
  }

  deactivateNote(midi: number) {
    this.activeEmitters.delete(midi);

    if (this.effect === 'fireworks') {
      for (const p of this.active) {
        if (p.midi === midi && !p.exploded) {
          const angle = Math.random() * Math.PI * 2;
          const speed = this.fireworksExplosionSpeed * (0.5 + Math.random());
          p.vx      = Math.cos(angle) * speed;
          p.vy      = Math.sin(angle) * speed;
          p.ay      = 0;
          p.decay   = 1 / (45 + Math.random() * 45);
          p.exploded = true;
        }
      }
    }
  }

  // ─── Spawn ────────────────────────────────────────────────────────────────

  private spawnN(count: number, xNorm: number, midi: number, velocity: number, isBurst: boolean) {
    const [r, g, b] = noteToRGB(midi);
    const x         = xNorm * this.width;
    const spreadPx  = this.width * this.spread * (isBurst ? 1.0 : 0.6);
    const velScale  = isBurst
      ? 0.5 + (velocity / 127) * 0.6
      : 0.4 + (velocity / 127) * 0.5;

    for (let i = 0; i < count; i++) {
      const p = this.getFreeParticle();
      if (!p) return;

      p.r = r; p.g = g; p.b = b;
      p.active   = true;
      p.midi     = midi;
      p.exploded = false;
      p.life     = 0;

      switch (this.effect) {

        // ── Rise (default) ────────────────────────────────────────────────
        case 'default':
          p.x  = x + (Math.random() - 0.5) * spreadPx;
          p.y  = this.height - Math.random() * 6;
          p.vx = (Math.random() - 0.5) * 0.6;
          p.vy = -(this.riseSpeed * (0.6 + Math.random() * 0.8)) * velScale;
          p.ay = 0;
          p.decay   = 1 / (this.lifetime * (0.7 + Math.random() * 0.6));
          p.phase   = 0;
          p.originX = x; p.originY = 0; p.orbitR = 0;
          break;

        // ── Fireworks ────────────────────────────────────────────────────
        case 'fireworks':
          p.x  = x + (Math.random() - 0.5) * spreadPx;
          p.y  = this.height - Math.random() * 6;
          p.vx = (Math.random() - 0.5) * 0.5;
          p.vy = -(this.riseSpeed * (0.7 + Math.random() * 0.7)) * velScale;
          p.ay = 0;
          p.decay   = 1 / (this.lifetime * (0.8 + Math.random() * 0.5));
          p.phase   = 0;
          p.originX = x; p.originY = 0; p.orbitR = 0;
          break;

        // ── Dance ─────────────────────────────────────────────────────────
        case 'dance':
          p.x  = x + (Math.random() - 0.5) * spreadPx;
          p.y  = this.height - Math.random() * 6;
          p.vx = (Math.random() - 0.5) * 0.5;
          p.vy = -(this.riseSpeed * (0.8 + Math.random() * 0.5)) * velScale;
          p.ay = 0;
          p.decay   = 1 / (this.lifetime * (1.0 + Math.random() * 0.5));
          p.phase   = Math.random() * Math.PI * 2;
          p.originX = x;
          p.originY = this.height * this.danceTargetY;
          p.orbitR  = 0;
          break;

        // ── Spiral ───────────────────────────────────────────────────────
        case 'spiral':
          p.x  = x;
          p.y  = this.height - Math.random() * 6;
          p.vx = 0;
          p.vy = -(this.riseSpeed * (0.5 + Math.random() * 0.5)) * velScale;
          p.ay = 0;
          p.phase   = (i / count) * Math.PI * 2 + Math.random() * 0.4;
          p.orbitR  = 3 + Math.random() * 10;
          p.originX = x;
          p.originY = 0;
          p.decay   = 1 / (this.lifetime * (0.8 + Math.random() * 0.4));
          break;

        // ── Fountain ─────────────────────────────────────────────────────
        case 'fountain': {
          const vertSpeed = (1.8 + Math.random() * 2.5) * velScale;
          const horzSpeed = (Math.random() - 0.5) * this.fountainSpread * velScale;
          p.x  = x + (Math.random() - 0.5) * spreadPx * 0.5;
          p.y  = this.height - Math.random() * 6;
          p.vx = horzSpeed;
          p.vy = -vertSpeed;
          p.ay = this.fountainGravity;
          p.decay   = 1 / (this.lifetime * (1.0 + Math.random() * 0.3));
          p.phase   = 0;
          p.originX = x; p.originY = 0; p.orbitR = 0;
          break;
        }

        // ── Comet ─────────────────────────────────────────────────────────
        case 'comet': {
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
          const speed = (4 + Math.random() * 7) * velScale * this.cometSpeed;
          p.x  = x;
          p.y  = this.height * 0.75;
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed;
          p.ay = 0;
          p.decay   = 1 / (this.cometLifetime * (0.6 + Math.random() * 0.8));
          p.phase   = 0;
          p.originX = x; p.originY = 0; p.orbitR = 0;
          break;
        }

        // ── Confetti ─────────────────────────────────────────────────────
        case 'confetti':
          p.x  = x + (Math.random() - 0.5) * spreadPx * 4;
          p.y  = this.height * (0.2 + Math.random() * 0.5);
          p.vx = (Math.random() - 0.5) * 1.5;
          p.vy = (Math.random() - 0.5) * 0.6;
          p.ay = this.confettiGravity;
          p.phase   = Math.random() * Math.PI * 2;
          p.originX = x;
          p.originY = 0;
          p.orbitR  = 0;
          p.decay   = 1 / (this.confettiLifetime * (0.7 + Math.random() * 0.6));
          break;

        // ── Orbit ─────────────────────────────────────────────────────────
        case 'orbit': {
          const targetR = this.orbitRadius + (midi % 12) * 4 + Math.random() * this.orbitRadius;
          p.phase   = Math.random() * Math.PI * 2;
          p.orbitR  = targetR;
          p.originX = x;
          p.originY = this.height * this.orbitTargetY;
          // Reuse ay as per-particle angular velocity for spread
          p.ay  = this.orbitSpeed + Math.random() * 0.012;
          p.x   = p.originX + Math.cos(p.phase) * p.orbitR;
          p.y   = p.originY + Math.sin(p.phase) * p.orbitR * this.orbitEllipse;
          p.vx  = 0; p.vy = 0;
          p.decay = 1 / (this.lifetime * (1.2 + Math.random() * 0.6));
          break;
        }
      }

      this.active.push(p);
    }
  }

  private getFreeParticle(): Particle | undefined {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return undefined;
  }

  // ─── Main loop ────────────────────────────────────────────────────────────

  update() {
    for (const emitter of this.activeEmitters.values()) {
      this.spawnN(this.emitRate, emitter.xNorm, emitter.midi, emitter.velocity, false);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += p.decay;

      switch (this.effect) {

        case 'default':
          p.vy *= 0.998; p.vx *= 0.995;
          p.x += p.vx;  p.y += p.vy;
          break;

        case 'fireworks':
          if (p.exploded) { p.vx *= 0.960; p.vy *= 0.960; }
          else            { p.vy *= 0.998; p.vx *= 0.995; }
          p.x += p.vx; p.y += p.vy;
          break;

        case 'dance':
          p.phase += this.danceSpeed;
          if (p.y > p.originY) {
            p.vy *= 0.987; p.vx *= 0.97;
            p.x += p.vx;  p.y += p.vy;
          } else {
            p.x += Math.sin(p.phase * 1.3) * this.danceAmplitude;
            p.y  = p.originY - 12 + Math.sin(p.phase * 0.8) * this.danceVertical;
          }
          break;

        case 'spiral':
          p.phase  += this.spiralRotSpeed;
          p.orbitR  = Math.min(p.orbitR + this.spiralExpand, this.spiralMaxRadius);
          p.vy     *= 0.999;
          p.x       = p.originX + Math.cos(p.phase) * p.orbitR;
          p.y      += p.vy;
          break;

        case 'fountain':
          p.vy += this.fountainGravity;
          p.vx *= 0.999;
          p.x  += p.vx; p.y += p.vy;
          break;

        case 'comet':
          p.vx *= 0.984; p.vy *= 0.984;
          p.x  += p.vx;  p.y  += p.vy;
          break;

        case 'confetti':
          p.phase += 0.05;
          p.vy    += this.confettiGravity;
          p.x     += Math.sin(p.phase + p.originX * 0.009) * this.confettiDrift;
          p.y     += p.vy;
          break;

        case 'orbit':
          // p.ay holds this particle's angular velocity
          p.phase += p.ay;
          p.x = p.originX + Math.cos(p.phase) * p.orbitR;
          p.y = p.originY + Math.sin(p.phase) * p.orbitR * this.orbitEllipse;
          break;
      }

      // Fountain dies when it falls off the bottom; everything else dies leaving any edge or aging
      const dead = p.life >= 1.0 || (
        this.effect === 'fountain'
          ? p.y > this.height + 80
          : (p.y < -80 || p.y > this.height + 80 || p.x < -80 || p.x > this.width + 80)
      );

      if (dead) {
        p.active = false;
        this.active.splice(i, 1);
      }
    }

    // ── GPU upload ──────────────────────────────────────────────────────────
    this.material.uniforms.uPointSize.value = this.pointSize * this.renderer.getPixelRatio();

    const count = this.active.length;
    for (let i = 0; i < count; i++) {
      const p = this.active[i];
      this.positions[i * 3]     = p.x;
      this.positions[i * 3 + 1] = this.height - p.y;  // flip Y for Three.js ortho camera
      this.positions[i * 3 + 2] = 0;

      const t = p.life;
      this.opacities[i] = t < 0.1 ? t * 10 : 1 - ((t - 0.1) / 0.9);

      this.colors[i * 3]     = p.r;
      this.colors[i * 3 + 1] = p.g;
      this.colors[i * 3 + 2] = p.b;
    }
    for (let i = count; i < MAX_PARTICLES; i++) {
      this.positions[i * 3 + 1] = -9999;
      this.opacities[i] = 0;
    }

    this.geometry.setDrawRange(0, MAX_PARTICLES);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aOpacity  as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor    as THREE.BufferAttribute).needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
