export type Rule = { born: number[]; survives: number[] };

export const RULE_PRESETS: ({ id: string; name: string; category: string } & Rule)[] = [
  { id: "life", name: "Conway's Life (B3/S23)", category: "Classic", born: [3], survives: [2, 3] },
  { id: "highlife", name: "HighLife (B36/S23)", category: "Classic", born: [3, 6], survives: [2, 3] },
  { id: "seeds", name: "Seeds (B2/S)", category: "Chaotic", born: [2], survives: [] },
  { id: "replicator", name: "Replicator (B1357/S1357)", category: "Chaotic", born: [1, 3, 5, 7], survives: [1, 3, 5, 7] },
  { id: "daynight", name: "Day & Night (B3678/S34678)", category: "Exotic", born: [3, 6, 7, 8], survives: [3, 4, 6, 7, 8] },
  { id: "diamoeba", name: "Diamoeba (B35678/S5678)", category: "Exotic", born: [3, 5, 6, 7, 8], survives: [5, 6, 7, 8] },
  { id: "morley", name: "Morley (B368/S245)", category: "Exotic", born: [3, 6, 8], survives: [2, 4, 5] },
  { id: "anneal", name: "Anneal (B4678/S35678)", category: "Exotic", born: [4, 6, 7, 8], survives: [3, 5, 6, 7, 8] },
];

/** Neighbor-count lookup: lut[n] === 1 means the count triggers. */
export function toLookup(counts: readonly number[]): Uint8Array {
  const lut = new Uint8Array(9);
  for (const n of counts) if (n >= 0 && n <= 8) lut[n] = 1;
  return lut;
}

export function randomRule(rand = Math.random): Rule {
  const pick = () => {
    const s = new Set<number>();
    const k = 1 + Math.floor(rand() * 4);
    while (s.size < k) s.add(Math.floor(rand() * 9));
    return [...s].sort((a, b) => a - b);
  };
  return { born: pick(), survives: pick() };
}

// General B/S engine on Uint8Array. Toroidal (wraps) so gliders loop forever.
export function step(
  grid: Uint8Array, next: Uint8Array, cols: number, rows: number,
  born: Uint8Array, survives: Uint8Array,
) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const xm = (x + cols - 1) % cols;
      const xp = (x + 1) % cols;
      const ym = (y + rows - 1) % rows;
      const yp = (y + 1) % rows;
      const n =
        grid[ym * cols + xm] + grid[ym * cols + x] + grid[ym * cols + xp] +
        grid[y * cols + xm] + grid[y * cols + xp] +
        grid[yp * cols + xm] + grid[yp * cols + x] + grid[yp * cols + xp];
      const i = y * cols + x;
      next[i] = grid[i] ? survives[n] : born[n];
    }
  }
}

export function randomize(grid: Uint8Array, density: number, rand = Math.random) {
  for (let i = 0; i < grid.length; i++) grid[i] = rand() < density ? 1 : 0;
}

export function count(grid: Uint8Array) {
  let s = 0;
  for (let i = 0; i < grid.length; i++) s += grid[i];
  return s;
}

const PATTERNS: Record<string, [number, number][]> = {
  glider: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  lwss: [[1, 0], [4, 0], [0, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
  pulsar: [
    [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
    [0, 2], [5, 2], [7, 2], [12, 2],
    [0, 3], [5, 3], [7, 3], [12, 3],
    [0, 4], [5, 4], [7, 4], [12, 4],
    [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
    [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7],
    [0, 8], [5, 8], [7, 8], [12, 8],
    [0, 9], [5, 9], [7, 9], [12, 9],
    [0, 10], [5, 10], [7, 10], [12, 10],
    [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12],
  ],
};

const GUN_CELLS: [number, number][] = [
  [24, 0], [22, 1], [24, 1], [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2],
  [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
  [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4],
  [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
  [10, 6], [16, 6], [24, 6], [11, 7], [15, 7], [12, 8], [13, 8],
];

export type PatternName = keyof typeof PATTERNS | "gun";

/** Raw cell offsets for a pattern (for ghost previews + centered stamping). */
export function patternCells(name: PatternName): [number, number][] {
  return name === "gun" ? GUN_CELLS : PATTERNS[name];
}

export function stamp(
  grid: Uint8Array, cols: number, rows: number,
  name: PatternName, cx: number, cy: number
) {
  if (name === "gun") {
    for (const [dx, dy] of GUN_CELLS) {
      const x = (((cx - 18 + dx) % cols) + cols) % cols;
      const y = (((cy - 4 + dy) % rows) + rows) % rows;
      grid[y * cols + x] = 1;
    }
    return;
  }
  for (const [dx, dy] of PATTERNS[name]) {
    const x = (cx + dx) % cols;
    const y = (cy + dy) % rows;
    grid[y * cols + x] = 1;
  }
}

/** Stamp a pattern centered on (cx, cy), wrapping toroidally. */
export function stampCentered(
  grid: Uint8Array, cols: number, rows: number,
  name: PatternName, cx: number, cy: number
) {
  const cells = patternCells(name);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [dx, dy] of cells) {
    if (dx < minX) minX = dx;
    if (dx > maxX) maxX = dx;
    if (dy < minY) minY = dy;
    if (dy > maxY) maxY = dy;
  }
  const ax = cx - Math.round((minX + maxX) / 2);
  const ay = cy - Math.round((minY + maxY) / 2);
  for (const [dx, dy] of cells) {
    const x = (((ax + dx) % cols) + cols) % cols;
    const y = (((ay + dy) % rows) + rows) % rows;
    grid[y * cols + x] = 1;
  }
}
