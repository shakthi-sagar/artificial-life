import { Atom, Dices, Focus, Pause, Play, Save, SkipForward, Timer, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Collapse } from "../../components/Collapse.js";
import { SimShell } from "../../components/SimShell.js";
import { SizeInput } from "../../components/ui/SizeInput.js";
import { Slider } from "../../components/ui/Slider.js";
import { Toggle } from "../../components/ui/Toggle.js";
import { useGpuEnabled, useWebGPU } from "../../lib/gpu.js";
import { mulberry32 } from "../../lib/sim.js";
import { useShareLink } from "../../lib/share.js";
import { SavePanel } from "../../components/SavePanel.js";
import { decodeParticles, encodeParticles, particleThumb, snapshot } from "./save.js";
import {
  CPU_DEFAULTS,
  DEFAULT_RANGES,
  PALETTE_LEN,
  GPU_DEFAULTS,
  R_MAX,
  createUniverse,
  randomizeMatrices,
  randomizeRadii,
  respawn,
  setCount,
  setRadius,
  setSpecies,
  step,
  type RadiusRanges,
  type Universe,
} from "./engine.js";
import { MatrixEditor, type MatrixTarget } from "./MatrixEditor.js";
import { RadiusVisualizer } from "./RadiusVisualizer.js";
import { GPUEngine } from "./engine-gpu.js";

const dockBtn =
  "pointer-events-auto grid size-11 place-items-center rounded-full bg-slate-800/80 text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-700/80 disabled:cursor-default disabled:opacity-40";
const fabBtn =
  "pointer-events-auto grid size-11 place-items-center rounded-full bg-slate-800/80 text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-700/80";
const ctlBtn =
  "rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-2 text-[13px] text-slate-100 transition-colors hover:border-emerald-500";

const newSeed = () => (Math.random() * 1e9) | 0;

export function ParticleLife() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const uniRef = useRef<Universe | null>(null);
  const camRef = useRef({ ox: 0, oy: 0, cs: 1 });
  const camTargetRef = useRef({ ox: 0, oy: 0, cs: 1 });
  const seamlessRef = useRef(true);
  const fitRef = useRef(1);
  const fittedRef = useRef(false);
  const rangesRef = useRef<RadiusRanges>({ min: [...DEFAULT_RANGES.min], max: [...DEFAULT_RANGES.max] });
  if (!uniRef.current) {
    const seed = newSeed();
    // reference-style world: stage size × 3 (screenMultiplierForGridSize)
    uniRef.current = createUniverse(
      {
        seed,
        worldW: Math.round(window.innerWidth * 3),
        worldH: Math.round(window.innerHeight * 3),
      },
      mulberry32(seed),
      rangesRef.current,
    );
  }

  const u0 = uniRef.current.params;
  const [running, setRunning] = useState(true);
  const [sps, setSps] = useState(60);
  const [fps, setFps] = useState(0);
  const [seed, setSeed] = useState(uniRef.current.seed);
  const [species, setSpeciesUI] = useState(u0.species);
  const [count, setCountUI] = useState(u0.count);
  const [worldW, setWorldW] = useState(u0.worldW);
  const [worldH, setWorldH] = useState(u0.worldH);
  const [repel, setRepel] = useState(u0.repel);
  const [force, setForce] = useState(u0.force);
  const [friction, setFriction] = useState(u0.friction);
  const [size, setSize] = useState(8);
  const [circles, setCircles] = useState(true);
  const [matVer, setMatVer] = useState(0);
  const [target, setTarget] = useState<MatrixTarget>("force");
  const [rangeMin, setRangeMin] = useState<[number, number]>([...DEFAULT_RANGES.min]);
  const [rangeMax, setRangeMax] = useState<[number, number]>([...DEFAULT_RANGES.max]);
  const [auto, setAuto] = useState(true);
  const [gpuErr, setGpuErr] = useState(false);
  const [seamless, setSeamless] = useState(true);
  const gpuSup = useWebGPU();
  const [gpuOn] = useGpuEnabled();
  const effective = auto && gpuSup === "yes" && gpuOn && !gpuErr ? "gpu" : "cpu";

  const runningRef = useRef(running);
  runningRef.current = running;
  const spsRef = useRef(sps);
  spsRef.current = sps;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const circlesRef = useRef(circles);
  circlesRef.current = circles;

  const panRef = useRef<{ id: number; lx: number; ly: number } | null>(null);
  const pinchRef = useRef<{ d: number; mx: number; my: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const spaceRef = useRef(false);
  const engineRef = useRef(effective);
  engineRef.current = effective;
  const matRevRef = useRef(matVer);
  matRevRef.current = matVer;
  const [lifeVer, setLifeVer] = useState(0);
  const lifeVerRef = useRef(lifeVer);
  lifeVerRef.current = lifeVer;
  const gpuRef = useRef<GPUEngine | null>(null);
  const gpuBusy = useRef(false);
  const gpuErrRef = useRef(false);
  const gpuCreating = useRef(false);

  seamlessRef.current = seamless;

  const applyPreset = (which: "cpu" | "gpu") => {
    const p = which === "cpu" ? CPU_DEFAULTS : GPU_DEFAULTS;
    const u = uniRef.current!;
    // count (clamped: brute-force GPU can't do full 64k yet)
    const targetCount = which === "cpu" ? p.count : Math.min(p.count, 20000);
    setCount(u, targetCount, Math.random);
    setCountUI(u.params.count);
    // dot size
    setSize(p.dot);
    // radii bands + re-roll radii so the look matches the reference scale
    rangesRef.current = { min: [...p.ranges.min], max: [...p.ranges.max] };
    setRangeMin([...p.ranges.min] as [number, number]);
    setRangeMax([...p.ranges.max] as [number, number]);
    randomizeRadii(u, Math.random, rangesRef.current);
    setMatVer((v) => v + 1);
    setLifeVer((v) => v + 1);
  };

  const syncFrom = (u: Universe) => {
    setSpeciesUI(u.params.species);
    setCountUI(u.params.count);
    setWorldW(u.params.worldW);
    setWorldH(u.params.worldH);
    setRepel(u.params.repel);
    setForce(u.params.force);
    setFriction(u.params.friction);
    setSeed(u.seed);
    setMatVer((v) => v + 1);
  };

  const newUniverse = () => {
    const p = uniRef.current!.params;
    const s = newSeed();
    uniRef.current = createUniverse({ ...p, seed: s }, mulberry32(s), rangesRef.current);
    syncFrom(uniRef.current);
    setLifeVer((v) => v + 1);
  };


  // ---- sizing ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      if (!fittedRef.current) {
        fittedRef.current = true;
        // start zoomed 1:1 into the center of the (screen × 3) world, like the reference
        const u = uniRef.current!;
        fitRef.current = 1;
        camRef.current.cs = 1;
        camRef.current.ox = (r.width - u.params.worldW) / 2;
        camRef.current.oy = (r.height - u.params.worldH) / 2;
        camTargetRef.current = { ...camRef.current };
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // ---- loop ----
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let ema = 60;
    let frames = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      ema = ema * 0.95 + (1000 / Math.max(1, dt)) * 0.05;
      if (runningRef.current) {
        acc += dt;
        const interval = 1000 / spsRef.current;
        if (engineRef.current === "gpu" && gpuRef.current && !gpuErrRef.current) {
          if (!gpuBusy.current && acc >= interval) {
            acc = Math.min(acc - interval, interval * 4);
            gpuBusy.current = true;
            gpuRef.current
              .step(uniRef.current!, matRevRef.current, lifeVerRef.current)
              .catch(() => {
                gpuErrRef.current = true;
                setGpuErr(true);
              })
              .finally(() => {
                gpuBusy.current = false;
              });
          }
        } else {
          let n = 0;
          while (acc >= interval && n < 4) {
            acc -= interval;
            n++;
            step(uniRef.current!);
          }
          if (n === 4) acc = 0;
        }
      }
      // ease camera toward target (ref panSmoothing 0.17 / zoomSmoothing 0.15)
      const cam = camRef.current;
      const tgt = camTargetRef.current;
      cam.ox += (tgt.ox - cam.ox) * 0.2;
      cam.oy += (tgt.oy - cam.oy) * 0.2;
      cam.cs += (tgt.cs - cam.cs) * 0.18;
      if (Math.abs(tgt.ox - cam.ox) < 0.01) cam.ox = tgt.ox;
      if (Math.abs(tgt.oy - cam.oy) < 0.01) cam.oy = tgt.oy;
      if (Math.abs(tgt.cs - cam.cs) < 0.0005) cam.cs = tgt.cs;
      draw();
      if (++frames % 30 === 0) setFps(Math.round(ema));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lazy GPU engine creation / teardown
  useEffect(() => {
    if (effective === "gpu" && !gpuRef.current && !gpuCreating.current) {
      gpuCreating.current = true;
      GPUEngine.create()
        .then((e) => {
          e.onError = () => {
            gpuErrRef.current = true;
            setGpuErr(true);
          };
          gpuRef.current = e;
          gpuCreating.current = false;
        })
        .catch(() => {
          gpuErrRef.current = true;
          setGpuErr(true);
          gpuCreating.current = false;
        });
    }
    return () => {
      if (effective !== "gpu") {
        gpuRef.current?.destroy();
        gpuRef.current = null;
      }
    };
  }, [effective]);
  useEffect(() => () => {
    gpuRef.current?.destroy();
    gpuRef.current = null;
  }, []);

  // ---- wheel + space ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        spaceRef.current = down;
        if (!down) canvas.style.cursor = "default";
        else if (!panRef.current) canvas.style.cursor = "grab";
      }
    };
    const dn = onKey(true);
    const up = onKey(false);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cssSize() {
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { w: canvas.width / dpr, h: canvas.height / dpr };
  }

  function zoomAt(px: number, py: number, factor: number) {
    const cam = camTargetRef.current;
    const fit = fitRef.current;
    const next = Math.min(fit * 15, Math.max(fit * 0.15, cam.cs * factor));
    const ratio = next / cam.cs;
    cam.ox = px - (px - cam.ox) * ratio;
    cam.oy = py - (py - cam.oy) * ratio;
    cam.cs = next;
  }

  function recenter() {
    const u = uniRef.current!;
    const { w, h } = cssSize();
    const cam = camTargetRef.current;
    cam.ox = (w - u.params.worldW * cam.cs) / 2;
    cam.oy = (h - u.params.worldH * cam.cs) / 2;
    camRef.current = { ...cam };
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const u = uniRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { ox, oy, cs } = camRef.current;
    const { worldW, worldH } = u.params;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    const Ww = worldW * cs;
    const Hh = worldH * cs;
    const seamless = seamlessRef.current;
    ctx.fillStyle = "#07090d";
    ctx.fillRect(ox, oy, Ww, Hh);

    const s = sizeRef.current * cs;
    const round = circlesRef.current && s >= 2.5;
    const n = u.params.count;
    // clip strictly to the world rect — nothing escapes the game bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, Ww, Hh);
    ctx.clip();
    const drawDot = (sx: number, sy: number, color: string) => {
      if (sx < ox - s || sx > ox + Ww + s || sy < oy - s || sy > oy + Hh + s) return;
      ctx.fillStyle = color;
      if (round) {
        ctx.beginPath();
        ctx.arc(sx, sy, s / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
    };
    for (let i = 0; i < n; i++) {
      const sx = ox + u.px[i] * cs;
      const sy = oy + u.py[i] * cs;
      const color = u.colors[u.sp[i]];
      if (!seamless) {
        drawDot(sx, sy, color);
        continue;
      }
      // contained toroidal ghosts: same rect, wrapped copies — clip keeps it inside
      drawDot(sx, sy, color);
      const nearL = sx - ox < s;
      const nearR = ox + Ww - sx < s;
      const nearT = sy - oy < s;
      const nearB = oy + Hh - sy < s;
      if (nearL) drawDot(sx + Ww, sy, color);
      if (nearR) drawDot(sx - Ww, sy, color);
      if (nearT) drawDot(sx, sy + Hh, color);
      if (nearB) drawDot(sx, sy - Hh, color);
      if (nearL && nearT) drawDot(sx + Ww, sy + Hh, color);
      if (nearR && nearT) drawDot(sx - Ww, sy + Hh, color);
      if (nearL && nearB) drawDot(sx + Ww, sy - Hh, color);
      if (nearR && nearB) drawDot(sx - Ww, sy - Hh, color);
    }
    ctx.restore();

    ctx.strokeStyle = "#252525";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(ox) + 0.5, Math.floor(oy) + 0.5, Math.floor(Ww), Math.floor(Hh));
  }

  // ---- gestures: pan only (no paint in v1) ----
  function localPos(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    canvas.setPointerCapture(e.pointerId);
    const p = localPos(e);
    pointersRef.current.set(e.pointerId, p);
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      panRef.current = null;
      canvas.style.cursor = "grabbing";
      return;
    }
    panRef.current = { id: e.pointerId, lx: p.x, ly: p.y };
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = localPos(e);
    pointersRef.current.set(e.pointerId, p);
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const prev = pinchRef.current;
      if (prev.d > 0 && d > 0) {
        zoomAt(mx, my, d / prev.d);
        camTargetRef.current.ox += mx - prev.mx;
        camTargetRef.current.oy += my - prev.my;
      }
      pinchRef.current = { d, mx, my };
      return;
    }
    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      camTargetRef.current.ox += p.x - pan.lx;
      camTargetRef.current.oy += p.y - pan.ly;
      pan.lx = p.x;
      pan.ly = p.y;
    }
  }

  function endPointer(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
        (e.currentTarget as HTMLCanvasElement).style.cursor = "default";
      }
      return;
    }
    if (panRef.current?.id === e.pointerId) {
      panRef.current = null;
      (e.currentTarget as HTMLCanvasElement).style.cursor = spaceRef.current ? "grab" : "default";
    }
  }

  // ---- save & share ----
  const getCode = () => encodeParticles(snapshot(uniRef.current!, size, circles));
  /** Rebuild the universe from a save: same physics, particles respawned from its seed. */
  const applySave = async (code: string) => {
    const sv = await decodeParticles(code, PALETTE_LEN);
    if (!sv) throw new Error("not a Particle Life save");
    const u = createUniverse(
      { species: sv.species, count: sv.count, repel: sv.repel, force: sv.force, friction: sv.friction,
        worldW: sv.worldW, worldH: sv.worldH, seed: sv.seed },
      mulberry32(sv.seed),
      rangesRef.current,
    );
    u.colors = [...sv.colors];
    u.rules.set(sv.rules);
    u.minR.set(sv.minR);
    u.maxR.set(sv.maxR);
    uniRef.current = u;
    syncFrom(u);
    setSize(sv.dot);
    setCircles(sv.circles);
    setLifeVer((v) => v + 1);
    recenter();
  };
  const setLink = useShareLink(applySave);

  // ---- mutations ----
  const paintCell = (a: number, b: number, v: number) => {
    const u = uniRef.current!;
    const i = a * u.params.species + b;
    if (target === "force") u.rules[i] = Math.min(1, Math.max(-1, v));
    else setRadius(u, i, target === "min" ? "min" : "max", Math.min(R_MAX, Math.max(0, v)));
    setMatVer((x) => x + 1);
  };

  return (
    <SimShell
      n="02"
      title="Particle Life"
      icon={<Atom size={24} />}
      accent="#f472b6"
      stats={
        <>
          <span><b>{count}</b> pts</span>
          <span><b>{fps}</b> fps</span>
          <span className="flex items-center gap-1 font-mono" style={{ color: effective === "gpu" ? "#f0abfc" : undefined }}>
            <Zap size={11} className="inline" /> {effective === "gpu" ? "GPU" : "CPU"}
          </span>
        </>
      }
      meta={<span>seed {seed} · {species} species · wrap</span>}
      dock={
        <>
          <button type="button" title="New universe" aria-label="New universe" className={dockBtn} onClick={newUniverse}>
            <Dices size={19} />
          </button>
          <button
            type="button" title="Play or Pause" aria-label="Play or Pause"
            className={`${dockBtn} !size-14 !text-[22px]`} onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
          </button>
          <button
            type="button" title="Step once" aria-label="Step once" className={dockBtn} disabled={running}
            onClick={() => step(uniRef.current!)}
          >
            <SkipForward size={19} />
          </button>
          <button type="button" title="Recenter view" aria-label="Recenter view" className={dockBtn} onClick={recenter}>
            <Focus size={19} />
          </button>
        </>
      }
      dockBelow={
        <label className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm" title="Steps per second">
          <Timer size={14} className="shrink-0" />
          <input type="range" min={15} max={240} value={sps} onChange={(e) => setSps(Number(e.target.value))} className="w-28" />
          <span className="min-w-9 text-right font-mono">{sps}/s</span>
        </label>
      }
      quickActions={
        <button type="button" title="New universe" aria-label="New universe" className={fabBtn} onClick={newUniverse}>
          <Dices size={19} />
        </button>
      }
      controls={
        <>
          <Collapse label="Save & share" icon={<Save size={16} className="text-pink-400" />}>
            <SavePanel
              sim="particle-life"
              getCode={getCode}
              onShare={setLink}
              onLoad={async (code) => {
                await applySave(code);
                setLink(code);
              }}
              thumb={particleThumb}
            />
          </Collapse>
          <Collapse label="Matrix" icon={<span className="text-pink-400 text-base leading-none">▦</span>} opened>
            <MatrixEditor
              n={species}
              colors={uniRef.current.colors}
              rules={uniRef.current.rules}
              minR={uniRef.current.minR}
              maxR={uniRef.current.maxR}
              target={target}
              onTarget={setTarget}
              version={matVer}
              onPaint={paintCell}
              onRandomize={() => {
                if (target === "force") randomizeMatrices(uniRef.current!, Math.random, rangesRef.current);
                else {
                  const u = uniRef.current!;
                  const lo = target === "min" ? rangeMin : rangeMax;
                  randomizeRadii(u, Math.random, {
                    min: target === "min" ? lo : rangeMin,
                    max: target === "max" ? lo : rangeMax,
                  });
                }
                setMatVer((v) => v + 1);
              }}
            />
            <p className="mt-1 text-xs opacity-80">
              Force: −1 repels, +1 attracts. Radii: attraction only acts between Min R and Max R.
            </p>
          </Collapse>

          <Collapse label="Radii" icon={<span className="text-cyan-300 text-base leading-none">◎</span>}>
            <RadiusVisualizer
              ranges={{ min: rangeMin, max: rangeMax }}
              onChange={(r) => {
                rangesRef.current = r;
                setRangeMin([...r.min] as [number, number]);
                setRangeMax([...r.max] as [number, number]);
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[13px] text-slate-300">
                <span className="inline-block size-2 rounded-full bg-cyan-400" /> Min R
              </span>
              <span className="flex items-center gap-1 font-mono text-xs text-slate-300">
                {rangeMin[0]}–{rangeMin[1]}u
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[13px] text-slate-300">
                <span className="inline-block size-2 rounded-full bg-amber-300" /> Max R
              </span>
              <span className="flex items-center gap-1 font-mono text-xs text-slate-300">
                {rangeMax[0]}–{rangeMax[1]}u
              </span>
            </div>
            <p className="mt-2 text-xs opacity-80">
              Attraction acts only between MIN and MAX. Drag the rings, then roll to draw each pair from the band.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                title="Randomize radii from the range bands"
                aria-label="Randomize radii"
                className={`${ctlBtn} flex items-center justify-center gap-1.5`}
                onClick={() => {
                  randomizeRadii(uniRef.current!, Math.random, rangesRef.current);
                  setMatVer((v) => v + 1);
                }}
              >
                <Dices size={15} /> Radii
              </button>
              <button
                type="button"
                title="Randomize forces and radii"
                aria-label="Randomize forces and radii"
                className={`${ctlBtn} flex items-center justify-center gap-1.5`}
                onClick={() => {
                  randomizeMatrices(uniRef.current!, Math.random, rangesRef.current);
                  setMatVer((v) => v + 1);
                }}
              >
                <Dices size={15} /> Force + Radii
              </button>
            </div>
          </Collapse>

          <Collapse label="Species" icon={<span className="text-violet-400 text-base leading-none">●</span>}>
            <Slider label="Species" value={species} min={1} max={10} onChange={(v) => {
              setSpecies(uniRef.current!, v, Math.random, rangesRef.current);
              syncFrom(uniRef.current!);
              setLifeVer((x) => x + 1);
            }} tip="Number of particle types. Rebuilds the matrix." />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {uniRef.current.colors.map((c, i) => (
                <input
                  key={`${i}-${matVer}`}
                  type="color"
                  value={c}
                  title={`Species ${i} color`}
                  aria-label={`Species ${i} color`}
                  onChange={(e) => {
                    uniRef.current!.colors[i] = e.target.value;
                    setMatVer((v) => v + 1);
                  }}
                  className="size-7 cursor-pointer appearance-none rounded-full border border-slate-600 bg-none p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0"
                />
              ))}
            </div>
          </Collapse>

          <Collapse label="World" icon={<span className="text-cyan-400 text-base leading-none">🌍</span>}>
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-700/80 p-[3px] text-xs">
              <button type="button" onClick={() => applyPreset("cpu")} className="rounded-lg px-2 py-1 text-slate-300 transition-colors hover:bg-slate-800/80" title="CPU preset: 6000 pts, size 8, radii 30-60 / 90-150 (reference CPU store)">CPU · 6k</button>
              <button type="button" onClick={() => applyPreset("gpu")} className="rounded-lg px-2 py-1 text-slate-300 transition-colors hover:bg-slate-800/80" title="GPU preset: dense field, size 2, radii 12-24 / 32-64 (reference GPU store; count capped until spatial-hash GPU lands)">GPU · dense</button>
            </div>
            <Slider label="Particles" value={count} min={50} max={64000} step={10} input onChange={(v) => {
              setCount(uniRef.current!, v, Math.random);
              setCountUI(uniRef.current!.params.count);
              setLifeVer((l) => l + 1);
            }} tip="Grow spawns new particles; shrink removes from the end. Existing ones are kept." />
            <div className="mt-2 mb-2 flex items-center gap-1.5">
              <span className="shrink-0 text-[15px] text-slate-300">Size</span>
              <SizeInput label="W" value={worldW} min={200} max={12000} aria="World width" onCommit={(v) => {
                uniRef.current!.params.worldW = v;
                respawn(uniRef.current!, Math.random);
                setWorldW(v);
                setLifeVer((l) => l + 1);
              }} />
              <SizeInput label="H" value={worldH} min={200} max={12000} aria="World height" onCommit={(v) => {
                uniRef.current!.params.worldH = v;
                respawn(uniRef.current!, Math.random);
                setWorldH(v);
                setLifeVer((l) => l + 1);
              }} />
            </div>
            <p className="text-xs opacity-80">Edges wrap toroidally. Resizing respawns the soup.</p>
            <div className="mt-1.5">
              <Toggle label="Seamless wrap" checked={seamless} onChange={setSeamless} tip="Tile the world 3×3 so particles glide across edges instead of popping. Matches reference mirror-wrap feel." />
            </div>
          </Collapse>

          <Collapse label="Physics" icon={<span className="text-fuchsia-400 text-base leading-none">⚛</span>} opened>
            <Slider label="Repel" value={Math.round(repel * 100)} min={1} max={400} unit="%" input onChange={(v) => {
              uniRef.current!.params.repel = v / 100;
              setRepel(v / 100);
            }} tip="Short-range push when particles overlap." />
            <div className="mt-1.5">
              <Slider label="Force" value={Math.round(force * 100)} min={1} max={200} unit="%" input onChange={(v) => {
                uniRef.current!.params.force = v / 100;
                setForce(v / 100);
              }} tip="Overall interaction strength." />
            </div>
            <div className="mt-1.5">
              <Slider label="Friction" value={Math.round(friction * 100)} min={0} max={90} unit="%" input onChange={(v) => {
                uniRef.current!.params.friction = v / 100;
                setFriction(v / 100);
              }} tip="Velocity damping per step." />
            </div>
          </Collapse>

          <Collapse label="Display" icon={<span className="text-amber-400 text-base leading-none">◐</span>} opened>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[15px] text-slate-300">Engine</span>
              <div className="grid w-40 grid-cols-2 gap-1 rounded-xl bg-slate-700/80 p-[3px]">
                <button
                  type="button"
                  onClick={() => setAuto(true)}
                  className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                    auto ? "bg-slate-900/80 font-bold text-white" : "text-slate-300 hover:bg-slate-800/80"
                  }`}
                >
                  Auto{gpuSup === "yes" && gpuOn ? " · GPU" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setAuto(false)}
                  className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                    !auto ? "bg-slate-900/80 font-bold text-white" : "text-slate-300 hover:bg-slate-800/80"
                  }`
                  }
                >
                  CPU
                </button>
              </div>
            </div>
            {gpuSup !== "yes" && <p className="text-xs opacity-80">WebGPU unavailable in this browser — CPU engine only.</p>}
            {gpuSup === "yes" && !gpuOn && <p className="text-xs opacity-80">GPU acceleration is off — enable it from the hub navbar.</p>}
            {gpuErr && <p className="text-xs text-rose-300">GPU engine failed — fell back to CPU.</p>}
            <Slider label="Dot size" value={Math.round(size)} min={1} max={24} onChange={(v) => setSize(v)} tip="Particle diameter in world units." />
            <div className="mt-1.5">
              <Toggle label="Round dots" checked={circles} onChange={setCircles} tip="Circles when big enough, squares when tiny." />
            </div>
          </Collapse>
        </>
      }
    >
      <figure ref={stageRef as React.RefObject<HTMLElement | null>} className="absolute inset-0 m-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full touch-none"
          style={{ cursor: "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onContextMenu={(e) => e.preventDefault()}
        />
      </figure>
    </SimShell>
  );
}
