// Framework-free CPU particle-life engine (2D, toroidal wrap).
// Force model mirrors the reference: linear short-range repulsion below
// minRadius, triangular attraction peaked at mid radius with height = rule.

export const PALETTE = [
  "#4ade80", "#22d3ee", "#facc15", "#f472b6", "#c084fc",
  "#fb923c", "#a3e635", "#f8fafc", "#34d399", "#f43f5e",
];

export type Params = {
  count: number;
  species: number;
  repel: number;
  force: number;
  friction: number;
  worldW: number;
  worldH: number;
};

export type Universe = {
  params: Params;
  seed: number;
  colors: string[];
  rules: Float32Array; // n*n in [-1, 1]; [a*n+b] = pull of a toward b
  minR: Float32Array;
  maxR: Float32Array;
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  sp: Uint8Array;
};

export const DEFAULTS: Params = {
  count: 6000,
  species: 7,
  repel: 1,
  force: 1,
  friction: 0.3,
  worldW: 1280,
  worldH: 800,
};

/** Reference parity: CPU store vs GPU store use different scale presets.
 *  CPU = sparse field (big dots, wide radii), GPU = dense field
 *  (tiny dots, tight radii). Our brute-force GPU can't yet do 64k like
 *  the reference spatial-hash GPU, so GPU_COUNT_CAP stays conservative. */
export const CPU_DEFAULTS = {
  count: 6000,
  dot: 8,
  ranges: { min: [30, 60], max: [90, 150] } as RadiusRanges,
};
export const GPU_DEFAULTS = {
  // reference uses 64000; we cap lower until the GPU kernel gets spatial hashing
  count: 64000,
  dot: 2,
  ranges: { min: [12, 24], max: [32, 64] } as RadiusRanges,
};
export const GPU_COUNT_CAP = 20000;

export const PALETTE_LEN = PALETTE.length;

export type RadiusRanges = { min: [number, number]; max: [number, number] };

export const R_MAX = 200;

export const DEFAULT_RANGES: RadiusRanges = { min: [30, 60], max: [90, 150] };

const randInt = (rand: () => number, lo: number, hi: number) =>
  Math.round(lo + rand() * Math.max(0, hi - lo));

function writeRadii(u: Universe, i: number, minV: number, maxV: number) {
  const lo = Math.max(0, Math.min(R_MAX - 1, Math.round(minV)));
  const hi = Math.max(lo + 1, Math.min(R_MAX, Math.round(maxV)));
  u.minR[i] = lo;
  u.maxR[i] = hi;
}

/** Randomized min/max radius per pair, drawn from the given ranges. */
export function randomizeRadii(u: Universe, rand: () => number, ranges: RadiusRanges) {
  const n = u.params.species;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const i = a * n + b;
      writeRadii(
        u,
        i,
        randInt(rand, ranges.min[0], ranges.min[1]),
        randInt(rand, ranges.max[0], ranges.max[1]),
      );
    }
  }
}

export function randomizeMatrices(u: Universe, rand: () => number, ranges: RadiusRanges = DEFAULT_RANGES) {
  const n = u.params.species;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const i = a * n + b;
      u.rules[i] = rand() * 2 - 1;
      writeRadii(
        u,
        i,
        randInt(rand, ranges.min[0], ranges.min[1]),
        randInt(rand, ranges.max[0], ranges.max[1]),
      );
    }
  }
}

/** Set one radius, keeping minR < maxR. */
export function setRadius(u: Universe, index: number, which: "min" | "max", v: number) {
  if (which === "min") writeRadii(u, index, v, u.maxR[index]);
  else writeRadii(u, index, u.minR[index], v);
}

/** Fresh positions / velocities / species mix. Keeps matrices + colors. */
export function respawn(u: Universe, rand: () => number) {
  const { count, species, worldW, worldH } = u.params;
  // even species mix, shuffled
  const mix = new Uint8Array(count);
  for (let i = 0; i < count; i++) mix[i] = i % species;
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = mix[i];
    mix[i] = mix[j];
    mix[j] = t;
  }
  for (let i = 0; i < count; i++) {
    u.px[i] = rand() * worldW;
    u.py[i] = rand() * worldH;
    u.vx[i] = 0;
    u.vy[i] = 0;
    u.sp[i] = mix[i];
  }
}

export function createUniverse(
  opts: Partial<Params> & { seed: number },
  rand: () => number,
  ranges: RadiusRanges = DEFAULT_RANGES,
): Universe {
  const params: Params = { ...DEFAULTS, ...opts };
  const n = params.species;
  const u: Universe = {
    params,
    seed: opts.seed,
    colors: PALETTE.slice(0, n),
    rules: new Float32Array(n * n),
    minR: new Float32Array(n * n),
    maxR: new Float32Array(n * n),
    px: new Float32Array(params.count),
    py: new Float32Array(params.count),
    vx: new Float32Array(params.count),
    vy: new Float32Array(params.count),
    sp: new Uint8Array(params.count),
  };
  randomizeMatrices(u, rand, ranges);
  respawn(u, rand);
  return u;
}

/** Change species count: fresh colors + matrices + respawn. */
export function setSpecies(u: Universe, n: number, rand: () => number, ranges: RadiusRanges = DEFAULT_RANGES) {
  n = Math.min(PALETTE.length, Math.max(1, Math.round(n)));
  u.params.species = n;
  u.colors = PALETTE.slice(0, n);
  u.rules = new Float32Array(n * n);
  u.minR = new Float32Array(n * n);
  u.maxR = new Float32Array(n * n);
  randomizeMatrices(u, rand, ranges);
  respawn(u, rand);
}

/** Change particle count incrementally: existing particles are preserved;
 *  new ones spawn at random positions with zero velocity (reference behavior). */
export function setCount(u: Universe, count: number, rand: () => number) {
  count = Math.max(50, Math.min(64000, Math.round(count)));
  const old = u.params.count;
  if (count === old) return;
  const { species, worldW, worldH } = u.params;
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const sp = new Uint8Array(count);
  const keep = Math.min(old, count);
  px.set(u.px.subarray(0, keep));
  py.set(u.py.subarray(0, keep));
  vx.set(u.vx.subarray(0, keep));
  vy.set(u.vy.subarray(0, keep));
  sp.set(u.sp.subarray(0, keep));
  for (let i = keep; i < count; i++) {
    px[i] = rand() * worldW;
    py[i] = rand() * worldH;
    vx[i] = 0;
    vy[i] = 0;
    sp[i] = Math.floor(rand() * species);
  }
  u.params.count = count;
  u.px = px;
  u.py = py;
  u.vx = vx;
  u.vy = vy;
  u.sp = sp;
}

function forceOf(rule: number, minR: number, maxR: number, d: number, repel: number) {
  if (d < minR) return (repel / minR) * d - repel;
  if (d > maxR) return 0;
  const mid = (minR + maxR) / 2;
  const slope = rule / (mid - minR);
  return -(slope * Math.abs(d - mid)) + rule;
}

// --- pooled spatial-hash scratch (avoids per-step Map/GC jank = smoother wrap) ---
let gridHead = new Int32Array(0);
let gridNext = new Int32Array(0);
let gridCacheKey = "";

function gridKey(ncx: number, ncy: number, n: number) {
  return `${ncx}x${ncy}:${n}`;
}

export function step(u: Universe) {
  const p = u.params;
  const n = p.count;
  const spCount = p.species;
  const { px, py, vx, vy, sp, rules, minR, maxR } = u;
  const { worldW: W, worldH: H, repel, force, friction } = p;

  // spatial hash cell = largest interaction radius
  let cell = 1;
  for (let i = 0; i < maxR.length; i++) if (maxR[i] > cell) cell = maxR[i];
  const ncx = Math.max(1, Math.ceil(W / cell));
  const ncy = Math.max(1, Math.ceil(H / cell));
  const key = gridKey(ncx, ncy, n);
  if (key !== gridCacheKey) {
    gridHead = new Int32Array(ncx * ncy).fill(-1);
    gridNext = new Int32Array(n);
    gridCacheKey = key;
  } else {
    gridHead.fill(-1);
  }
  // build intrusive linked lists: head[cell] -> i -> next[i]
  for (let i = 0; i < n; i++) {
    let cx = Math.floor(px[i] / cell);
    let cy = Math.floor(py[i] / cell);
    cx %= ncx;
    if (cx < 0) cx += ncx;
    cy %= ncy;
    if (cy < 0) cy += ncy;
    const c = cx * ncy + cy;
    gridNext[i] = gridHead[c];
    gridHead[c] = i;
  }

  const damp = 1 - friction;
  const hw = W / 2;
  const hh = H / 2;

  for (let i = 0; i < n; i++) {
    const ax = px[i];
    const ay = py[i];
    const ca = sp[i];
    let cx = Math.floor(ax / cell) % ncx;
    if (cx < 0) cx += ncx;
    let cy = Math.floor(ay / cell) % ncy;
    if (cy < 0) cy += ncy;

    let fx = 0;
    let fy = 0;
    for (let oy = -1; oy <= 1; oy++) {
      let ny = cy + oy;
      if (ny < 0) ny += ncy;
      else if (ny >= ncy) ny -= ncy;
      for (let ox = -1; ox <= 1; ox++) {
        let nx = cx + ox;
        if (nx < 0) nx += ncx;
        else if (nx >= ncx) nx -= ncx;
        for (let j = gridHead[nx * ncy + ny]; j !== -1; j = gridNext[j]) {
          if (j === i) continue;
          let dx = px[j] - ax;
          let dy = py[j] - ay;
          if (dx > hw) dx -= W;
          else if (dx < -hw) dx += W;
          if (dy > hh) dy -= H;
          else if (dy < -hh) dy += H;
          const cb = sp[j];
          const m = ca * spCount + cb;
          const mR = maxR[m];
          const d2 = dx * dx + dy * dy;
          if (d2 >= mR * mR || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const f = forceOf(rules[m], minR[m], mR, d, repel);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
      }
    }
    vx[i] = (vx[i] + fx * force) * damp;
    vy[i] = (vy[i] + fy * force) * damp;
  }

  // proper toroidal wrap (handles large steps without sticking)
  for (let i = 0; i < n; i++) {
    let x = px[i] + vx[i];
    let y = py[i] + vy[i];
    x -= W * Math.floor(x / W);
    y -= H * Math.floor(y / H);
    px[i] = x;
    py[i] = y;
  }
}
