import { describe, expect, it } from "vitest";
import { mulberry32 } from "./sim.js";
import { packCode, unpackCode } from "./share.js";
import { decodeLife, encodeLife, fromRuns, toRuns } from "../sims/game-of-life/save.js";
import { createUniverse } from "../sims/particle-life/engine.js";
import { decodeParticles, encodeParticles, snapshot } from "../sims/particle-life/save.js";

describe("share codes", () => {
  it("round-trips arbitrary JSON through deflate + base64url", async () => {
    const data = { a: [1, 2, 3], b: "héllo", c: { d: true } };
    const code = await packCode("x1", data);
    expect(code).toMatch(/^x1\.[A-Za-z0-9_-]+$/);
    expect(await unpackCode("x1", code)).toEqual(data);
  });

  it("rejects wrong prefixes and garbage", async () => {
    const code = await packCode("x1", { a: 1 });
    expect(await unpackCode("y1", code)).toBeNull();
    expect(await unpackCode("x1", "x1.!!!!")).toBeNull();
    expect(await unpackCode("x1", "x1.AAAA")).toBeNull();
  });
});

describe("game of life saves", () => {
  it("run-length encodes any grid losslessly", () => {
    const rng = mulberry32(3);
    for (const density of [0, 0.02, 0.5, 1]) {
      const grid = Uint8Array.from({ length: 997 }, () => (rng() < density ? 1 : 0));
      expect(fromRuns(toRuns(grid), grid.length)).toEqual(grid);
    }
  });

  it("round-trips a board and compresses sparse ones well", async () => {
    const w = 400;
    const h = 400;
    const grid = new Uint8Array(w * h);
    [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]].forEach(([x, y]) => (grid[(y + 50) * w + x + 50] = 1));
    const save = { w, h, born: [3], survives: [2, 3], alive: "#4ade80", bg: "#07090d", speed: 12, runs: toRuns(grid) };
    const code = await encodeLife(save);
    expect(code.length).toBeLessThan(200);
    const back = (await decodeLife(code))!;
    expect(back).toEqual(save);
    expect(fromRuns(back.runs, w * h)).toEqual(grid);
  });

  it("rejects out-of-range boards and rules", async () => {
    const base = { w: 10, h: 10, born: [3], survives: [2, 3], alive: "#fff000", bg: "#000000", speed: 5, runs: [100] };
    expect(await decodeLife(await encodeLife({ ...base, w: 5000 }))).toBeNull();
    expect(await decodeLife(await encodeLife({ ...base, born: [9] }))).toBeNull();
    expect((await decodeLife(await encodeLife({ ...base, alive: "red" })))!.alive).toBe("#4ade80");
  });
});

describe("particle life saves", () => {
  it("round-trips physics, colours and matrices", async () => {
    const u = createUniverse({ seed: 42, species: 5, count: 800 }, mulberry32(42));
    const snap = snapshot(u, 6, false);
    const back = (await decodeParticles(await encodeParticles(snap), 10))!;
    expect(back.species).toBe(5);
    expect(back.colors).toEqual(u.colors);
    expect(back.dot).toBe(6);
    expect(back.circles).toBe(false);
    back.rules.forEach((v, i) => expect(v).toBeCloseTo(u.rules[i], 2));
    expect(back.maxR).toEqual(Array.from(u.maxR));
  });

  it("rejects matrices that don't match the species count", async () => {
    const u = createUniverse({ seed: 1, species: 4, count: 100 }, mulberry32(1));
    const snap = { ...snapshot(u, 8, true), rules: [0.5] };
    expect(await decodeParticles(await encodeParticles(snap), 10)).toBeNull();
  });
});
