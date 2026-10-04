import { packCode, unpackCode } from "../../lib/share.js";
import { R_MAX, type Universe } from "./engine.js";

/** A universe's physics and look. Positions aren't stored: they respawn from `seed`. */
export type ParticleSave = {
  seed: number;
  species: number;
  count: number;
  repel: number;
  force: number;
  friction: number;
  worldW: number;
  worldH: number;
  colors: string[];
  /** n×n row-major, rounded */
  rules: number[];
  minR: number[];
  maxR: number[];
  dot: number;
  circles: boolean;
};

const PREFIX = "p1";
const HEX = /^#[0-9a-f]{6}$/i;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function snapshot(u: Universe, dot: number, circles: boolean): ParticleSave {
  const p = u.params;
  return {
    seed: u.seed,
    species: p.species,
    count: p.count,
    repel: r3(p.repel),
    force: r3(p.force),
    friction: r3(p.friction),
    worldW: p.worldW,
    worldH: p.worldH,
    colors: [...u.colors],
    rules: Array.from(u.rules, r3),
    minR: Array.from(u.minR),
    maxR: Array.from(u.maxR),
    dot,
    circles,
  };
}

export const encodeParticles = (s: ParticleSave) => packCode(PREFIX, s);

/** Decode and validate; matrices must match the species count. */
export async function decodeParticles(code: string, maxSpecies: number): Promise<ParticleSave | null> {
  const d = await unpackCode<Partial<ParticleSave>>(PREFIX, code);
  if (!d) return null;
  const n = Math.round(num(d.species, 1, maxSpecies, 0));
  const mat = (xs: unknown, lo: number, hi: number) =>
    Array.isArray(xs) && xs.length === n * n && xs.every((v) => typeof v === "number" && Number.isFinite(v))
      ? (xs as number[]).map((v) => Math.min(hi, Math.max(lo, v)))
      : null;
  const rules = mat(d.rules, -1, 1);
  const minR = mat(d.minR, 0, R_MAX);
  const maxR = mat(d.maxR, 1, R_MAX);
  const colors = Array.isArray(d.colors) && d.colors.length === n && d.colors.every((c) => HEX.test(c)) ? d.colors : null;
  if (!n || !rules || !minR || !maxR || !colors) return null;
  return {
    seed: Math.round(num(d.seed, 0, 2 ** 31, 1)),
    species: n,
    count: Math.round(num(d.count, 50, 64000, 6000)),
    repel: num(d.repel, 0, 10, 1),
    force: num(d.force, 0, 10, 1),
    friction: num(d.friction, 0, 1, 0.3),
    worldW: Math.round(num(d.worldW, 100, 20000, 1280)),
    worldH: Math.round(num(d.worldH, 100, 20000, 800)),
    colors,
    rules,
    minR,
    maxR: maxR.map((v, i) => Math.max(v, minR[i] + 1)),
    dot: num(d.dot, 1, 24, 8),
    circles: d.circles !== false,
  };
}

const thumbs = new Map<string, string>();

/** Matrix preview: attraction as green/red cells, species colours along the edges. */
export async function particleThumb(code: string): Promise<string | null> {
  const hit = thumbs.get(code);
  if (hit) return hit;
  const s = await decodeParticles(code, 64);
  if (!s) return null;
  const n = s.species;
  const cell = Math.max(2, Math.floor(46 / (n + 1)));
  const size = cell * (n + 1);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#07090d";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = s.colors[i];
    ctx.fillRect((i + 1) * cell, 0, cell - 1, cell - 1);
    ctx.fillRect(0, (i + 1) * cell, cell - 1, cell - 1);
    for (let j = 0; j < n; j++) {
      const v = s.rules[i * n + j];
      const a = Math.round(Math.abs(v) * 255);
      ctx.fillStyle = v >= 0 ? `rgb(${40},${80 + a * 0.6},${60})` : `rgb(${80 + a * 0.6},${40},${50})`;
      ctx.fillRect((j + 1) * cell, (i + 1) * cell, cell - 1, cell - 1);
    }
  }
  const url = canvas.toDataURL();
  thumbs.set(code, url);
  return url;
}
