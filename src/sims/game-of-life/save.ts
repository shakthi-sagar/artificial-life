import { packCode, unpackCode } from "../../lib/share.js";

/** Everything needed to restore a board: rule, size, colours, speed and the live cells. */
export type LifeSave = {
  w: number;
  h: number;
  born: number[];
  survives: number[];
  alive: string;
  bg: string;
  speed: number;
  /** run lengths over the row-major grid, alternating dead/alive, starting dead */
  runs: number[];
};

const PREFIX = "l1";
const HEX = /^#[0-9a-f]{6}$/i;
const counts = (xs: unknown) =>
  Array.isArray(xs) && xs.every((n) => Number.isInteger(n) && n >= 0 && n <= 8) ? [...new Set(xs as number[])].sort() : null;

export function toRuns(grid: Uint8Array): number[] {
  const runs: number[] = [];
  let cur = 0;
  let n = 0;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i] ? 1 : 0;
    if (v === cur) n++;
    else {
      runs.push(n);
      cur = v;
      n = 1;
    }
  }
  runs.push(n);
  return runs;
}

export function fromRuns(runs: number[], size: number): Uint8Array {
  const grid = new Uint8Array(size);
  let i = 0;
  let v = 0;
  for (const n of runs) {
    if (v) grid.fill(1, i, Math.min(size, i + n));
    i += n;
    v ^= 1;
    if (i >= size) break;
  }
  return grid;
}

export const encodeLife = (s: LifeSave) => packCode(PREFIX, s);

/** Decode and validate; anything malformed comes back null. */
export async function decodeLife(code: string, maxDim = 400): Promise<LifeSave | null> {
  const d = await unpackCode<Partial<LifeSave>>(PREFIX, code);
  if (!d) return null;
  const born = counts(d.born);
  const survives = counts(d.survives);
  const ok =
    Number.isInteger(d.w) && Number.isInteger(d.h) &&
    d.w! >= 1 && d.h! >= 1 && d.w! <= maxDim && d.h! <= maxDim &&
    born && survives &&
    Array.isArray(d.runs) && d.runs.every((n) => Number.isInteger(n) && n >= 0);
  if (!ok) return null;
  return {
    w: d.w!,
    h: d.h!,
    born: born!,
    survives: survives!,
    alive: HEX.test(d.alive ?? "") ? d.alive! : "#4ade80",
    bg: HEX.test(d.bg ?? "") ? d.bg! : "#07090d",
    speed: Math.min(60, Math.max(1, Math.round(Number(d.speed) || 12))),
    runs: d.runs!,
  };
}

const thumbs = new Map<string, string>();

/** Board preview: the whole grid fitted into a small image. */
export async function lifeThumb(code: string): Promise<string | null> {
  const hit = thumbs.get(code);
  if (hit) return hit;
  const s = await decodeLife(code);
  if (!s) return null;
  const grid = fromRuns(s.runs, s.w * s.h);
  const canvas = document.createElement("canvas");
  canvas.width = s.w;
  canvas.height = s.h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, s.w, s.h);
  ctx.fillStyle = s.alive;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (grid[y * s.w + x]) ctx.fillRect(x, y, 1, 1);
  const url = canvas.toDataURL();
  thumbs.set(code, url);
  return url;
}
