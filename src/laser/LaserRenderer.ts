/**
 * LaserRenderer — converts VIZO visualization state into LaserCube point frames.
 *
 * Pipeline (as recommended in the LaserCube developer docs):
 *
 *   Particle/Cymatics simulation
 *         ↓
 *   Density grid (256×256)
 *         ↓
 *   Marching-squares contour extraction
 *         ↓
 *   Ramer-Douglas-Peucker path simplification
 *         ↓
 *   Nearest-neighbour path ordering
 *         ↓
 *   Laser frame assembly (blanking + dwell points)
 *         ↓
 *   LaserBridge.sendPoints()
 *
 * Modes:
 *   '2d'  — uses the 2D particle positions projected onto the XY plane
 *   '3d'  — uses the 3D voxel particle cloud, summed along the Z axis
 */

import { marchingSquares } from './MarchingSquares';
import { rdp, orderPaths, buildColouredLaserFrame } from './PathUtils';
import type { LaserPoint }         from './LaserBridge';
import type { VoxelParticle3D }    from './VoxelParticle3D';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NoteColor { midi: number; r: number; g: number; b: number; }

/** Minimal particle shape accepted from the 2D ParticleSystem. */
interface Particle2D {
  x: number; y: number; alpha: number;
  r: number; g: number; b: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GRID_W   = 128;  // density grid resolution
const GRID_H   = 128;
const RDP_EPS  = 0.008; // path simplification tolerance (normalized 0..1)
const MAX_PTS  = 800;   // frame point budget (~30fps × 800 = 24k pps)

// ─── LaserRenderer ───────────────────────────────────────────────────────────

export class LaserRenderer {
  mode: '2d' | '3d' = '2d';

  private densityGrid   = new Float32Array(GRID_W * GRID_H);
  private noteColors    = new Map<number, [number, number, number]>();

  // Tunable
  threshold  = 0.3;    // contour threshold as fraction of peak density
  brightness = 1.0;    // output brightness multiplier

  // ─── Note colour tracking ──────────────────────────────────────────────

  noteOn(midi: number, r: number, g: number, b: number) {
    this.noteColors.set(midi, [r, g, b]);
  }

  noteOff(midi: number) {
    this.noteColors.delete(midi);
  }

  // ─── 2D frame generation ──────────────────────────────────────────────

  /**
   * Generate a laser frame from the 2D particle system.
   *
   * @param particles  Array of live particles from ParticleSystem.active
   * @param canvasW    Canvas pixel width (for normalising x coords)
   * @param canvasH    Canvas pixel height (for normalising y coords)
   */
  generate2DFrame(
    particles: Particle2D[],
    canvasW: number,
    canvasH: number,
  ): LaserPoint[] {
    this.buildDensityGrid2D(particles, canvasW, canvasH);
    return this.extractAndBuild();
  }

  // ─── 3D frame generation ──────────────────────────────────────────────

  /**
   * Generate a laser frame from the 3D voxel particle system.
   * Projects all particles onto the XY plane (summing along Z).
   */
  generate3DFrame(system: VoxelParticle3D): LaserPoint[] {
    this.buildDensityGrid3D(system);
    return this.extractAndBuild();
  }

  // ─── Cymatics frame generation ─────────────────────────────────────────

  /**
   * Generate a laser frame directly from a cymatics wave-function sample.
   *
   * @param sampleFn   Returns wave amplitude at normalised (x,y) ∈ [0,1]²
   */
  generateCymaticsFrame(sampleFn: (x: number, y: number) => number): LaserPoint[] {
    const grid = this.densityGrid;
    let peak = 0;

    for (let row = 0; row < GRID_H; row++) {
      for (let col = 0; col < GRID_W; col++) {
        const v = Math.abs(sampleFn(col / GRID_W, row / GRID_H));
        grid[row * GRID_W + col] = v;
        if (v > peak) peak = v;
      }
    }

    // Normalise
    if (peak > 0) {
      for (let i = 0; i < grid.length; i++) grid[i] /= peak;
    }

    return this.extractAndBuild();
  }

  // ─── Density-grid builders ─────────────────────────────────────────────

  private buildDensityGrid2D(
    particles: Particle2D[],
    canvasW: number,
    canvasH: number,
  ) {
    const grid = this.densityGrid;
    grid.fill(0);

    for (const p of particles) {
      const gx = Math.floor((p.x / canvasW) * (GRID_W - 1));
      const gy = Math.floor((p.y / canvasH) * (GRID_H - 1));
      if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) continue;
      grid[gy * GRID_W + gx] += p.alpha;
    }

    // Gaussian blur pass (3×3 box, 2 iterations) to smooth sparse deposits
    this.boxBlur(grid, GRID_W, GRID_H);
    this.boxBlur(grid, GRID_W, GRID_H);

    // Normalise to 0..1
    let peak = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > peak) peak = grid[i];
    if (peak > 0) for (let i = 0; i < grid.length; i++) grid[i] /= peak;
  }

  private buildDensityGrid3D(system: VoxelParticle3D) {
    const grid = this.densityGrid;
    grid.fill(0);

    for (const p of system.active) {
      const gx = Math.floor(p.x * (GRID_W - 1));
      const gy = Math.floor(p.y * (GRID_H - 1));
      if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) continue;
      // Accumulate Z-projected brightness (weighted by depth for pseudo-3D)
      const depthWeight = 0.4 + p.z * 0.6;
      grid[gy * GRID_W + gx] += p.alpha * depthWeight;
    }

    this.boxBlur(grid, GRID_W, GRID_H);
    this.boxBlur(grid, GRID_W, GRID_H);

    let peak = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > peak) peak = grid[i];
    if (peak > 0) for (let i = 0; i < grid.length; i++) grid[i] /= peak;
  }

  // ─── Contour extraction + laser frame build ────────────────────────────

  private extractAndBuild(): LaserPoint[] {
    const raw = marchingSquares(
      this.densityGrid, GRID_W, GRID_H,
      this.threshold,
    );

    if (raw.length === 0) return [];

    // Simplify each polyline
    const simplified = raw
      .map(poly => rdp(poly, RDP_EPS))
      .filter(poly => poly.length >= 2);

    // Order paths for minimal beam travel
    const ordered = orderPaths(simplified);

    // Assign colour: blend all active note colours
    const [cr, cg, cb] = this.blendNoteColors();
    const br = Math.min(1, this.brightness);

    // Build coloured paths (all same colour for now — extend per-path later)
    const colourPaths = ordered.map(path => ({
      path,
      r: cr * br,
      g: cg * br,
      b: cb * br,
    }));

    return buildColouredLaserFrame(colourPaths, MAX_PTS);
  }

  // ─── Colour helpers ────────────────────────────────────────────────────

  private blendNoteColors(): [number, number, number] {
    if (this.noteColors.size === 0) return [0.5, 0.8, 1.0]; // default cyan

    let r = 0, g = 0, b = 0;
    for (const [nr, ng, nb] of this.noteColors.values()) {
      r += nr; g += ng; b += nb;
    }
    const n = this.noteColors.size;
    return [r / n, g / n, b / n];
  }

  // ─── Utility ───────────────────────────────────────────────────────────

  private boxBlur(grid: Float32Array, w: number, h: number) {
    const tmp = new Float32Array(grid.length);
    for (let row = 1; row < h - 1; row++) {
      for (let col = 1; col < w - 1; col++) {
        tmp[row * w + col] = (
          grid[(row - 1) * w + col - 1] + grid[(row - 1) * w + col] + grid[(row - 1) * w + col + 1] +
          grid[row * w + col - 1]       + grid[row * w + col]       + grid[row * w + col + 1] +
          grid[(row + 1) * w + col - 1] + grid[(row + 1) * w + col] + grid[(row + 1) * w + col + 1]
        ) / 9;
      }
    }
    grid.set(tmp);
  }

  /** Expose the density grid for the preview canvas. */
  getDensityGrid(): Float32Array { return this.densityGrid; }
  getGridSize(): [number, number] { return [GRID_W, GRID_H]; }
}
