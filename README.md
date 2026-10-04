# Artificial Life Lab 🧫

One site, many toys — exploring emergence (Game of Life, Particle Life, and more to come: slime mold, Turing patterns…). Single Vite + React + TS app: the dashboard lists every sim, each sim is a route with a full-viewport stage + sidebar controls + floating dock.

```
index.html · vite.config.ts · tsconfig.json · package.json
src/
  main.tsx · App.tsx (routes) · index.css · sims.ts (registry)
  components/SimShell.tsx   full-viewport layout (stage + sidebar + dock)
  pages/    Dashboard.tsx · NotFound.tsx
  sims/     game-of-life/{GameOfLife.tsx, engine.ts} · particle-life/… (one folder per toy)
  lib/      sim.ts — useAnimationLoop + seeded RNG
scripts/new-sim.mjs         scaffolder
```

## Quickstart

```bash
pnpm install
pnpm dev      # → http://localhost:5173
pnpm build
pnpm test      # vitest: engine unit tests (*.test.ts)
pnpm deploy:cloudflare   # → https://life-sim.shadster.dev (Cloudflare Worker, static assets)
```

Production is a Cloudflare Worker serving `dist/` as static assets, with
`life-sim.shadster.dev` attached as a Worker custom domain (`wrangler.jsonc`).

## Save & share

No server involved: every sim serialises its config to a prefixed **code** (`src/lib/share.ts`)
that lives in the URL hash, so links work anywhere and never hit a backend.

- `l1.` Life board (rule, size, colours, run-length cells) · `p1.` Particle Life
  universe (physics, colours, matrices, seed) — JSON, deflated, base64url
- `#/<sim>?cfg=<code>` — the share link
- `components/SavePanel.tsx` — shared Save / copy link / paste-to-load panel, plus a "saved in this browser"
  list (localStorage) with per-sim thumbnails

## Add a sim

```bash
pnpm new-sim boids Boids   # scaffolds src/sims/boids/
```

Then add a `<Route>` in `src/App.tsx` and add the entry to `src/sims.ts`.

## Conventions

- **Sims never own pages** — they render inside `<SimShell>` (stage fills viewport, controls in sidebar, essentials in dock).
- **Engines are framework-free** — `src/sims/<id>/engine.ts` is pure TS on typed arrays, no React. Components only handle canvas + controls.
- **Registry drives the hub** — `src/sims.ts` is the single source of truth for the dashboard.

## Creatures

Creatures started here as the third sim and moved to its own app at
[creatures.shadster.dev](https://creatures.shadster.dev) as it grows toward a builder and an ecosystem
simulation. Old `#/creatures` links (share codes included) redirect there; it is no longer listed on the dashboard.

## Roadmap

- [x] shell (stage + sidebar + dock) + game-of-life + particle-life
- [x] creatures (moved to its own app)
- [ ] boids, langton's ant, slime mold, reaction-diffusion, evo-eaters
