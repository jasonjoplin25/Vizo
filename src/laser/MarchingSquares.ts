/**
 * MarchingSquares — extracts iso-contour polylines from a 2D density grid.
 *
 * Input:  Float32Array density map (row-major, width×height)
 * Output: Array of polylines  [ [[x,y], [x,y], ...], ... ]
 *         Coordinates are normalized 0..1 in grid space.
 *
 * Used to convert the particle density field (or cymatics wave field)
 * into vector paths suitable for laser projection.
 *
 * Algorithm: standard marching-squares with linear interpolation on edges.
 */

export type Vec2     = [number, number];
export type Polyline = Vec2[];

// Lookup table: 16 cases → list of edge-pairs [(e0,e1), ...]
// Edges: 0=top, 1=right, 2=bottom, 3=left (same convention as Wikipedia)
const EDGE_TABLE: [number, number][][] = [
  [],                // 0000
  [[3, 2]],         // 0001
  [[1, 2]],         // 0010
  [[3, 1]],         // 0011
  [[0, 1]],         // 0100
  [[0, 3], [1, 2]], // 0101 – saddle point (use alt)
  [[0, 2]],         // 0110
  [[0, 3]],         // 0111
  [[0, 3]],         // 1000
  [[0, 2]],         // 1001
  [[0, 1], [2, 3]], // 1010 – saddle point (use alt)
  [[0, 1]],         // 1011
  [[3, 1]],         // 1100
  [[1, 2]],         // 1101
  [[3, 2]],         // 1110
  [],               // 1111
];

/**
 * Extract contour polylines at the given threshold.
 *
 * @param grid    Row-major density values (row = y, col = x)
 * @param width   Number of columns
 * @param height  Number of rows
 * @param threshold  Iso-value (e.g. 0.5 × peak density)
 */
export function marchingSquares(
  grid: Float32Array,
  width: number,
  height: number,
  threshold: number,
): Polyline[] {
  // Collect raw segment endpoints, then chain them into polylines
  const segments: [Vec2, Vec2][] = [];

  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width - 1; col++) {
      const tl = grid[row * width + col];
      const tr = grid[row * width + col + 1];
      const br = grid[(row + 1) * width + col + 1];
      const bl = grid[(row + 1) * width + col];

      // Build 4-bit case index
      const idx =
        ((tl >= threshold) ? 8 : 0) |
        ((tr >= threshold) ? 4 : 0) |
        ((br >= threshold) ? 2 : 0) |
        ((bl >= threshold) ? 1 : 0);

      if (idx === 0 || idx === 15) continue;

      // Interpolate intersection point on an edge
      const edgePoint = (edge: number): Vec2 => {
        // Corners in order: tl(top-left), tr, br, bl
        // Edge 0 = top (tl–tr), 1 = right (tr–br), 2 = bottom (br–bl), 3 = left (bl–tl)
        const corners = [
          [col, row],
          [col + 1, row],
          [col + 1, row + 1],
          [col, row + 1],
        ] as const;
        const vals = [tl, tr, br, bl];

        const c0 = corners[edge];
        const c1 = corners[(edge + 1) % 4];
        const v0 = vals[edge];
        const v1 = vals[(edge + 1) % 4];
        const t = (v0 === v1) ? 0.5 : (threshold - v0) / (v1 - v0);

        return [
          (c0[0] + t * (c1[0] - c0[0])) / (width - 1),
          (c0[1] + t * (c1[1] - c0[1])) / (height - 1),
        ];
      };

      for (const [e0, e1] of EDGE_TABLE[idx]) {
        segments.push([edgePoint(e0), edgePoint(e1)]);
      }
    }
  }

  // Chain segments into polylines (greedy endpoint matching)
  return chainSegments(segments);
}

/** Chain loose segments into continuous polylines. */
function chainSegments(segments: [Vec2, Vec2][]): Polyline[] {
  const used    = new Uint8Array(segments.length);
  const polys: Polyline[] = [];
  const EPS     = 1e-6;

  const ptEq = (a: Vec2, b: Vec2) =>
    Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = 1;

    const poly: Polyline = [segments[s][0], segments[s][1]];

    // Extend forward
    let extended = true;
    while (extended) {
      extended = false;
      const tail = poly[poly.length - 1];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        if (ptEq(segments[i][0], tail)) {
          poly.push(segments[i][1]);
          used[i] = 1;
          extended = true;
          break;
        }
        if (ptEq(segments[i][1], tail)) {
          poly.push(segments[i][0]);
          used[i] = 1;
          extended = true;
          break;
        }
      }
    }

    // Extend backward
    extended = true;
    while (extended) {
      extended = false;
      const head = poly[0];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        if (ptEq(segments[i][1], head)) {
          poly.unshift(segments[i][0]);
          used[i] = 1;
          extended = true;
          break;
        }
        if (ptEq(segments[i][0], head)) {
          poly.unshift(segments[i][1]);
          used[i] = 1;
          extended = true;
          break;
        }
      }
    }

    if (poly.length >= 2) polys.push(poly);
  }

  return polys;
}
