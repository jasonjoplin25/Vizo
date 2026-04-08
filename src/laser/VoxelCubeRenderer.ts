/**
 * VoxelCubeRenderer — Three.js renderer for the 3D laser projection preview.
 *
 * Displays a 1×1×1 unit cube wireframe with a live particle cloud inside,
 * representing the 3D laser projection volume (100×100×100 voxel space).
 *
 * The point cloud mirrors the VoxelParticle3D simulation.
 * A colour-coded axis indicator and soft grid lines help show depth.
 */

import * as THREE from 'three';
import type { VoxelParticle3D } from './VoxelParticle3D';

const MAX_POINTS = 8000; // GPU buffer size

export class VoxelCubeRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private particles: THREE.Points;
  private positions: Float32Array;
  private colors:    Float32Array;

  // Orbit state
  private azimuth   = Math.PI / 4;
  private elevation = Math.PI / 6;
  private radius    = 2.2;
  private isDragging = false;
  private lastMouse  = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    // ── Renderer ─────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x06060f, 1);

    // ── Scene ─────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    // ── Camera ────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 20);
    this.updateCamera();

    // ── Cube wireframe ────────────────────────────────────────────────────
    const box     = new THREE.BoxGeometry(1, 1, 1);
    const edges   = new THREE.EdgesGeometry(box);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x223355, transparent: true, opacity: 0.6 });
    this.scene.add(new THREE.LineSegments(edges, lineMat));

    // Axis lines (X=red, Y=green, Z=blue) at cube centre
    const axisHelper = new THREE.AxesHelper(0.6);
    axisHelper.position.set(-0.5, -0.5, -0.5);
    this.scene.add(axisHelper);

    // ── Particle point cloud ──────────────────────────────────────────────
    this.positions = new Float32Array(MAX_POINTS * 3);
    this.colors    = new Float32Array(MAX_POINTS * 3);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geom.setAttribute('color',    new THREE.BufferAttribute(this.colors,    3));
    geom.setDrawRange(0, 0);

    const mat = new THREE.PointsMaterial({
      size: 0.012,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.particles = new THREE.Points(geom, mat);
    this.scene.add(this.particles);

    // ── Ambient fog/glow (subtle) ─────────────────────────────────────────
    this.scene.fog = new THREE.FogExp2(0x06060f, 0.5);

    // ── Mouse orbit ───────────────────────────────────────────────────────
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup',   this.onMouseUp);
    canvas.addEventListener('wheel',     this.onWheel, { passive: true });
    canvas.style.cursor = 'grab';
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Call each animation frame with the current particle simulation state. */
  update(system: VoxelParticle3D) {
    const active = system.active;
    const count  = Math.min(active.length, MAX_POINTS);

    for (let i = 0; i < count; i++) {
      const p  = active[i];
      const pi = i * 3;
      // Map 0..1 cube to -0.5..+0.5 for centred geometry
      this.positions[pi]     = p.x - 0.5;
      this.positions[pi + 1] = p.y - 0.5;
      this.positions[pi + 2] = p.z - 0.5;

      this.colors[pi]     = p.r * p.alpha;
      this.colors[pi + 1] = p.g * p.alpha;
      this.colors[pi + 2] = p.b * p.alpha;
    }

    const geom = this.particles.geometry;
    geom.setDrawRange(0, count);
    (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.color    as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Resize to match the canvas element size. */
  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.particles.geometry.dispose();
    (this.particles.material as THREE.PointsMaterial).dispose();
    this.renderer.dispose();
  }

  // ─── Mouse orbit ──────────────────────────────────────────────────────────

  private onMouseDown = (e: MouseEvent) => {
    this.isDragging = true;
    this.lastMouse  = { x: e.clientX, y: e.clientY };
    (e.target as HTMLCanvasElement).style.cursor = 'grabbing';
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    this.azimuth   -= dx * 0.005;
    this.elevation  = Math.max(-1.2, Math.min(1.2, this.elevation - dy * 0.005));
    this.updateCamera();
  };

  private onMouseUp = (e: MouseEvent) => {
    this.isDragging = false;
    (e.target as HTMLCanvasElement).style.cursor = 'grab';
  };

  private onWheel = (e: WheelEvent) => {
    this.radius = Math.max(0.8, Math.min(5, this.radius + e.deltaY * 0.002));
    this.updateCamera();
  };

  private updateCamera() {
    const r = this.radius;
    this.camera.position.set(
      r * Math.cos(this.elevation) * Math.sin(this.azimuth),
      r * Math.sin(this.elevation),
      r * Math.cos(this.elevation) * Math.cos(this.azimuth),
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }
}
