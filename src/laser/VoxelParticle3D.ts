/**
 * VoxelParticle3D — lightweight 3D particle system for the laser voxel cube.
 *
 * The cube is modelled as a 1×1×1 unit box (matching the logical 100×100×100
 * voxel space). Particles spawn at the bottom face, rise through the volume,
 * and fade out near the top or after their lifetime expires.
 *
 * Used for both the Three.js preview canvas and laser point generation.
 */

export interface Particle3D {
  x: number; y: number; z: number;     // position  0..1
  vx: number; vy: number; vz: number;  // velocity  units/frame
  r: number; g: number; b: number;     // colour    0..1
  alpha: number;                       // brightness 0..1
  decay: number;                       // alpha decay per frame
  life: number;                        // frames remaining
}

// ─── Particle effect modes (same names as 2D for UI consistency) ─────────────
export type Effect3D =
  | 'default'   // rise + drift
  | 'explode'   // burst outward from center
  | 'fountain'  // arc with gravity
  | 'orbit'     // orbit a central axis
  | 'confetti'; // sinusoidal drift

export class VoxelParticle3D {
  private pool: Particle3D[] = [];
  public active: Particle3D[] = [];

  // ── Tunable params ───────────────────────────────────────────────────────
  effect: Effect3D     = 'default';
  emitRate             = 4;       // particles per note-on frame
  burstCount           = 18;      // particles per note-on burst
  lifetime             = 120;     // frames
  riseSpeed            = 0.004;
  spread               = 0.08;
  pointSize            = 1.0;     // used by Three.js renderer
  gravity              = 0.0001;
  orbitRadius          = 0.15;
  orbitSpeed           = 0.025;

  // key → active spawn flag
  private activeKeys = new Map<number, boolean>();

  constructor() {}

  // ─── Spawn ───────────────────────────────────────────────────────────────

  /** Called on noteOn — bursts N particles near the key's X position. */
  spawnForNote(
    midi: number,
    r: number, g: number, b: number,
    keyXNorm: number,  // 0..1 (left→right across cube X axis)
  ) {
    this.activeKeys.set(midi, true);
    const count = this.burstCount;
    for (let i = 0; i < count; i++) {
      this.spawn(r, g, b, keyXNorm);
    }
  }

  private spawn(
    r: number, g: number, b: number,
    keyX: number,
  ) {
    // Recycle from pool if available
    const p: Particle3D = this.pool.pop() ?? {
      x:0, y:0, z:0, vx:0, vy:0, vz:0, r:0, g:0, b:0, alpha:1, decay:0, life:0,
    };

    // Start near bottom of cube, centered on key X, random Z (depth)
    p.x = Math.max(0, Math.min(1, keyX + (Math.random() - 0.5) * this.spread));
    p.y = Math.random() * 0.1;             // near bottom
    p.z = 0.1 + Math.random() * 0.8;      // spread through depth

    switch (this.effect) {
      case 'explode': {
        // Burst from cube center
        p.x  = 0.5 + (Math.random() - 0.5) * 0.05;
        p.y  = 0.5 + (Math.random() - 0.5) * 0.05;
        p.z  = 0.5 + (Math.random() - 0.5) * 0.05;
        const az = Math.random() * Math.PI * 2;
        const el = (Math.random() - 0.5) * Math.PI;
        const sp = this.riseSpeed * 3 * (0.5 + Math.random());
        p.vx = Math.cos(el) * Math.cos(az) * sp;
        p.vy = Math.sin(el) * sp;
        p.vz = Math.cos(el) * Math.sin(az) * sp;
        break;
      }
      case 'fountain': {
        const angle = (Math.random() - 0.5) * this.spread * 4;
        const speed = this.riseSpeed * (1.5 + Math.random());
        p.vx = Math.sin(angle) * speed;
        p.vy = this.riseSpeed * 2.5 * (0.7 + Math.random() * 0.6);
        p.vz = (Math.random() - 0.5) * this.riseSpeed * 2;
        break;
      }
      case 'orbit': {
        // Will be managed in update
        p.vx = 0; p.vy = this.riseSpeed * 0.5; p.vz = 0;
        break;
      }
      case 'confetti': {
        p.vx = (Math.random() - 0.5) * this.riseSpeed * 2;
        p.vy = this.riseSpeed * (0.3 + Math.random() * 0.7);
        p.vz = (Math.random() - 0.5) * this.riseSpeed * 2;
        break;
      }
      default: { // 'default'
        p.vx = (Math.random() - 0.5) * this.riseSpeed * 1.5;
        p.vy = this.riseSpeed * (0.7 + Math.random() * 0.6);
        p.vz = (Math.random() - 0.5) * this.riseSpeed;
        break;
      }
    }

    p.r      = r;
    p.g      = g;
    p.b      = b;
    p.alpha  = 1.0;
    p.life   = this.lifetime + Math.floor(Math.random() * 40 - 20);
    p.decay  = 1 / p.life;

    this.active.push(p);
  }

  // ─── Deactivate (noteOff) ────────────────────────────────────────────────

  deactivateNote(midi: number) {
    this.activeKeys.delete(midi);
  }

  // ─── Update (call once per animation frame) ───────────────────────────────

  update() {
    const toRemove: number[] = [];

    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i];

      switch (this.effect) {
        case 'orbit': {
          // Spiral upward while orbiting Y axis
          const angle = Math.atan2(p.z - 0.5, p.x - 0.5) + this.orbitSpeed;
          const dist  = this.orbitRadius;
          p.x   = 0.5 + Math.cos(angle) * dist;
          p.z   = 0.5 + Math.sin(angle) * dist;
          p.y  += p.vy;
          break;
        }
        case 'fountain': {
          p.vy -= this.gravity * 2;
          p.x  += p.vx;
          p.y  += p.vy;
          p.z  += p.vz;
          break;
        }
        case 'confetti': {
          p.vx += Math.sin(p.life * 0.1) * 0.0003;
          p.vz += Math.cos(p.life * 0.13) * 0.0002;
          p.x  += p.vx;
          p.y  += p.vy;
          p.z  += p.vz;
          break;
        }
        default: {
          p.vy -= this.gravity;
          p.x  += p.vx;
          p.y  += p.vy;
          p.z  += p.vz;
          break;
        }
      }

      p.alpha -= p.decay;
      p.life--;

      // Fade out if near top or walls
      if (p.y > 0.9) p.alpha *= 0.96;

      if (p.alpha <= 0.01 || p.life <= 0) {
        toRemove.push(i);
      }
    }

    // Remove dead particles (back-to-front to preserve indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.pool.push(this.active.splice(toRemove[i], 1)[0]);
    }
  }

  // ─── Export for laser renderer ────────────────────────────────────────────

  /**
   * Returns particles sorted by brightness (brightest first) for the laser.
   * Caller should take only the first N points (budget 300–500 at 60fps).
   */
  getLaserPoints(maxPoints: number) {
    const sorted = [...this.active]
      .sort((a, b) => b.alpha - a.alpha)
      .slice(0, maxPoints);
    return sorted;
  }

  dispose() {
    this.active = [];
    this.pool   = [];
  }
}
