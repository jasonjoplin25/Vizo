/**
 * PathUtils — vector path processing for laser output.
 *
 * Includes:
 *   - Ramer-Douglas-Peucker simplification
 *   - Laser frame assembly (blanking + point budgeting)
 *   - Nearest-neighbour path ordering (minimize beam travel)
 */

import type { Vec2, Polyline } from './MarchingSquares';
import type { LaserPoint } from './LaserBridge';

// ─── Ramer-Douglas-Peucker simplification ────────────────────────────────────

function perpDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = p[0] - a[0], ey = p[1] - a[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  const ex = p[0] - cx, ey = p[1] - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * @param poly     Input polyline
 * @param epsilon  Max perpendicular deviation to keep (normalized coords)
 */
export function rdp(poly: Polyline, epsilon: number): Polyline {
  if (poly.length <= 2) return poly;

  let maxDist = 0, maxIdx = 0;
  const first = poly[0], last = poly[poly.length - 1];

  for (let i = 1; i < poly.length - 1; i++) {
    const d = perpDist(poly[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left  = rdp(poly.slice(0, maxIdx + 1), epsilon);
    const right = rdp(poly.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

// ─── Nearest-neighbour path ordering ─────────────────────────────────────────

function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * Greedy nearest-neighbour ordering of polyline paths.
 * Starts from (0.5, 0.5) and always picks the closest path-endpoint next.
 * Also reverses a path if its far end is closer to the current position.
 */
export function orderPaths(paths: Polyline[]): Polyline[] {
  if (paths.length === 0) return [];
  const remaining = paths.map((p, i) => ({ path: p, idx: i }));
  const ordered: Polyline[] = [];
  let cursor: Vec2 = [0.5, 0.5];

  while (remaining.length > 0) {
    let best = -1, bestD = Infinity, reversed = false;

    for (let i = 0; i < remaining.length; i++) {
      const p   = remaining[i].path;
      const d0  = dist2(cursor, p[0]);
      const d1  = dist2(cursor, p[p.length - 1]);
      const d   = Math.min(d0, d1);
      if (d < bestD) {
        bestD    = d;
        best     = i;
        reversed = d1 < d0;
      }
    }

    const entry = remaining.splice(best, 1)[0];
    const path  = reversed ? [...entry.path].reverse() : entry.path;
    ordered.push(path);
    cursor = path[path.length - 1];
  }

  return ordered;
}

// ─── Laser frame assembly ─────────────────────────────────────────────────────

/**
 * Build a laser point frame from a set of vector paths.
 *
 * Rules:
 *  - Insert BLANK_REPEATS blanking (black) points before each path start
 *  - Insert BLANK_REPEATS blanking points after each path end
 *  - Dwell DWELL_REPEATS coloured repeats at corners of each path
 *  - Total frame size is capped at maxPoints
 *
 * @param paths      Ordered, simplified polylines (coords 0..1)
 * @param r,g,b      Frame colour (0..1)
 * @param maxPoints  Frame point budget (≤ 1000 for 30fps @ 30k pps)
 */
export function buildLaserFrame(
  paths: Polyline[],
  r: number, g: number, b: number,
  maxPoints = 800,
): LaserPoint[] {
  const BLANK_REPEATS = 4;  // points with beam off before/after each path
  const DWELL_REPEATS = 2;  // beam-on repeats at each path vertex

  const frame: LaserPoint[] = [];

  for (const path of paths) {
    if (frame.length >= maxPoints) break;
    if (path.length < 2) continue;

    const start = path[0];

    // Blanking: beam OFF, move to start
    for (let i = 0; i < BLANK_REPEATS && frame.length < maxPoints; i++) {
      frame.push({ x: start[0], y: start[1], r: 0, g: 0, b: 0 });
    }

    // Draw path with dwell repeats at each vertex
    for (let vi = 0; vi < path.length; vi++) {
      const pt = path[vi];
      const reps = (vi === 0 || vi === path.length - 1) ? DWELL_REPEATS : 1;
      for (let d = 0; d < reps && frame.length < maxPoints; d++) {
        frame.push({ x: pt[0], y: pt[1], r, g, b });
      }
    }

    // Trailing blank
    const end = path[path.length - 1];
    for (let i = 0; i < BLANK_REPEATS && frame.length < maxPoints; i++) {
      frame.push({ x: end[0], y: end[1], r: 0, g: 0, b: 0 });
    }
  }

  return frame;
}

/**
 * Build a multi-colour frame from coloured paths.
 * Each entry carries its own RGB so different notes can have different colors.
 */
export function buildColouredLaserFrame(
  colourPaths: Array<{ path: Polyline; r: number; g: number; b: number }>,
  maxPoints = 800,
): LaserPoint[] {
  const BLANK_REPEATS = 4;
  const DWELL_REPEATS = 2;

  const frame: LaserPoint[] = [];

  for (const { path, r, g, b } of colourPaths) {
    if (frame.length >= maxPoints) break;
    if (path.length < 2) continue;

    const start = path[0];
    for (let i = 0; i < BLANK_REPEATS && frame.length < maxPoints; i++) {
      frame.push({ x: start[0], y: start[1], r: 0, g: 0, b: 0 });
    }

    for (let vi = 0; vi < path.length; vi++) {
      const pt   = path[vi];
      const reps = (vi === 0 || vi === path.length - 1) ? DWELL_REPEATS : 1;
      for (let d = 0; d < reps && frame.length < maxPoints; d++) {
        frame.push({ x: pt[0], y: pt[1], r, g, b });
      }
    }

    const end = path[path.length - 1];
    for (let i = 0; i < BLANK_REPEATS && frame.length < maxPoints; i++) {
      frame.push({ x: end[0], y: end[1], r: 0, g: 0, b: 0 });
    }
  }

  return frame;
}
