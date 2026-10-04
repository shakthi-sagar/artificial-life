import {
  Dices,
  Dna,
  Focus,
  Globe,
  Save,
  LayoutGrid,
  Link2,
  Pause,
  Play,
  SkipForward,
  Sparkles,
  Timer,
  Trash2,
  Undo2,
  Unlink,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Collapse } from "../../components/Collapse.js";
import { SimShell } from "../../components/SimShell.js";
import { SizeInput } from "../../components/ui/SizeInput.js";
import { Slider } from "../../components/ui/Slider.js";
import { Tip } from "../../components/ui/Tip.js";
import { Toggle } from "../../components/ui/Toggle.js";
import { RULE_PRESETS, count, patternCells, randomRule, randomize, stamp, stampCentered, step, toLookup, type PatternName, type Rule } from "./engine.js";
import { GolGpu } from "./engine-gpu.js";
import { useGpuEnabled, useWebGPU } from "../../lib/gpu.js";
import { useShareLink } from "../../lib/share.js";
import { SavePanel } from "../../components/SavePanel.js";
import { decodeLife, encodeLife, fromRuns, lifeThumb, toRuns } from "./save.js";

const COLS = 140;
const ROWS = 90;
const MIN_CS = 1.5;
const MAX_CS = 80;
const MIN_DIM = 10;
const MAX_DIM = 400;

const dockBtn =
  "pointer-events-auto grid size-11 place-items-center rounded-full bg-slate-800/80 text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-700/80 disabled:cursor-default disabled:opacity-40";
const ctlBtn =
  "rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-2 text-[13px] text-slate-100 transition-colors hover:border-emerald-500";
const fabBtn =
  "pointer-events-auto grid size-11 place-items-center rounded-full bg-slate-800/80 text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-700/80";

export function GameOfLife() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const gridRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS));
  const bufRef = useRef<Uint8Array>(new Uint8Array(COLS * ROWS));
  /** camera: pixel offset of world origin + px per cell */
  const camRef = useRef({ ox: 0, oy: 0, cs: 8 });
  const fittedRef = useRef(false);

  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(12);
  const [density, setDensity] = useState(0.18);
  const [gen, setGen] = useState(0);
  const [pop, setPop] = useState(0);
  const [born, setBorn] = useState<number[]>([3]);
  const [survives, setSurvives] = useState<number[]>([2, 3]);
  const [ruleHistory, setRuleHistory] = useState<Rule[]>([]);
  const [gridOn, setGridOn] = useState(true);
  const [zoomPx, setZoomPx] = useState(8);
  const [cols, setCols] = useState(COLS);
  const [rows, setRows] = useState(ROWS);
  const [linked, setLinked] = useState(true);
  const [brush, setBrush] = useState<PatternName | null>(null);
  const [aliveColor, setAliveColor] = useState("#4ade80");
  const [bgColor, setBgColor] = useState("#07090d");
  const [auto, setAuto] = useState(true);
  const [gpuErr, setGpuErr] = useState(false);
  const gpuSup = useWebGPU();
  const [gpuOn] = useGpuEnabled();
  const effective = auto && gpuSup === "yes" && gpuOn && !gpuErr ? "gpu" : "cpu";

  const runningRef = useRef(running);
  runningRef.current = running;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const gridOnRef = useRef(gridOn);
  gridOnRef.current = gridOn;
  const colsRef = useRef(COLS);
  const rowsRef = useRef(ROWS);
  const brushRef = useRef<PatternName | null>(null);
  brushRef.current = brush;
  const hoverRef = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false });
  const bornRef = useRef(toLookup([3]));
  const survRef = useRef(toLookup([2, 3]));
  bornRef.current = toLookup(born);
  survRef.current = toLookup(survives);
  const aliveRef = useRef(aliveColor);
  aliveRef.current = aliveColor;
  const bgRef = useRef(bgColor);
  bgRef.current = bgColor;

  // gesture state (refs, no re-renders)
  const paintRef = useRef<{ id: number; erase: boolean; moved: boolean; sx: number; sy: number } | null>(null);
  const panRef = useRef<{ id: number; lx: number; ly: number } | null>(null);
  const pinchRef = useRef<{ d: number; mx: number; my: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const lastClientRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  const engineRef = useRef(effective);
  engineRef.current = effective;
  const gpuRef = useRef<GolGpu | null>(null);
  const gpuBusy = useRef(false);
  const gpuErrRef = useRef(false);
  const gpuCreating = useRef(false);
  /** bumped on any direct grid mutation so GPU state re-uploads */
  const cellRevRef = useRef(0);
  const bumpCells = () => {
    cellRevRef.current++;
  };
  const wasRunningRef = useRef(false);
  const spaceRef = useRef(false);

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
        // cover (not contain): world always fills the viewport, overflow crops
        const cs = Math.max(r.width / COLS, r.height / ROWS);
        camRef.current.cs = cs;
        camRef.current.ox = (r.width - COLS * cs) / 2;
        camRef.current.oy = (r.height - ROWS * cs) / 2;
        setZoomPx(cs);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // ---- seed ----
  useEffect(() => {
    randomize(gridRef.current, 0.18);
    stamp(gridRef.current, COLS, ROWS, "gun", Math.floor(COLS / 2), 12);
    setPop(count(gridRef.current));
  }, []);

  // ---- sim loop (always draws, steps when running) ----
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (runningRef.current) {
        acc += dt;
        const interval = 1000 / speedRef.current;
        if (engineRef.current === "gpu" && gpuRef.current && !gpuErrRef.current) {
          if (!gpuBusy.current && acc >= interval) {
            acc = Math.min(acc - interval, interval * 4);
            gpuBusy.current = true;
            gpuRef.current
              .step(gridRef.current, colsRef.current, rowsRef.current, { born, survives }, cellRevRef.current)
              .then((pop) => {
                setGen((g) => g + 1);
                setPop(pop);
              })
              .catch(() => {
                gpuErrRef.current = true;
                setGpuErr(true);
              })
              .finally(() => {
                gpuBusy.current = false;
              });
          }
        } else {
          let advanced = false;
          let n = 0;
          while (acc >= interval && n < 8) {
            acc -= interval;
            n++;
            step(gridRef.current, bufRef.current, colsRef.current, rowsRef.current, bornRef.current, survRef.current);
            const t = gridRef.current;
            gridRef.current = bufRef.current;
            bufRef.current = t;
            setGen((g) => g + 1);
            advanced = true;
          }
          if (advanced) setPop(count(gridRef.current));
          if (n === 8) acc = 0;
        }
      }
      draw();
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
      GolGpu.create()
        .then((e) => {
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
  useEffect(
    () => () => {
      gpuRef.current?.destroy();
      gpuRef.current = null;
    },
    [],
  );

  // ---- wheel zoom (non-passive) + space key ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    const hoverAt = (cx: number, cy: number) => {
      const rect = canvas.getBoundingClientRect();
      const px = cx - rect.left;
      const py = cy - rect.top;
      const { ox, oy, cs } = camRef.current;
      return px >= ox && px <= ox + colsRef.current * cs && py >= oy && py <= oy + rowsRef.current * cs;
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "Escape" && down) {
        setBrush(null);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        spaceRef.current = down;
        if (!down) canvas.style.cursor = hoverAt(lastClientRef.current.x, lastClientRef.current.y) ? "crosshair" : "default";
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

  // ---- camera ops ----
  function cssSize() {
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { w: canvas.width / dpr, h: canvas.height / dpr };
  }

  function zoomAt(px: number, py: number, factor: number) {
    const cam = camRef.current;
    const next = Math.min(MAX_CS, Math.max(MIN_CS, cam.cs * factor));
    const ratio = next / cam.cs;
    cam.ox = px - (px - cam.ox) * ratio;
    cam.oy = py - (py - cam.oy) * ratio;
    cam.cs = next;
    setZoomPx(next);
  }

  function zoomStep(factor: number) {
    const { w, h } = cssSize();
    zoomAt(w / 2, h / 2, factor);
  }

  function recenter() {
    const { w, h } = cssSize();
    const cam = camRef.current;
    cam.ox = (w - colsRef.current * cam.cs) / 2;
    cam.oy = (h - rowsRef.current * cam.cs) / 2;
  }

  // ---- drawing ----
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { ox, oy, cs } = camRef.current;

    // viewport backdrop: pure black. The world box gets its own void color.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = bgRef.current;
    ctx.fillRect(ox, oy, colsRef.current * cs, rowsRef.current * cs);

    const x0 = Math.max(0, Math.floor(-ox / cs));
    const cols = colsRef.current;
    const rows = rowsRef.current;
    const x1 = Math.min(cols - 1, Math.ceil((W - ox) / cs));
    const y0 = Math.max(0, Math.floor(-oy / cs));
    const y1 = Math.min(rows - 1, Math.ceil((H - oy) / cs));

    ctx.fillStyle = aliveRef.current;
    const g = gridRef.current;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (g[y * cols + x]) ctx.fillRect(ox + x * cs, oy + y * cs, cs + 0.5, cs + 0.5);
      }
    }

    // grid: full lines when cells are big, border only when small
    ctx.strokeStyle = "#252525";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (gridOnRef.current && cs >= 8) {
      for (let r = y0; r <= y1 + 1; r++) {
        const y = Math.floor(oy + r * cs) + 0.5;
        ctx.moveTo(Math.floor(ox + x0 * cs) + 0.5, y);
        ctx.lineTo(Math.floor(ox + (x1 + 1) * cs) + 0.5, y);
      }
      for (let c = x0; c <= x1 + 1; c++) {
        const x = Math.floor(ox + c * cs) + 0.5;
        ctx.moveTo(x, Math.floor(oy + y0 * cs) + 0.5);
        ctx.lineTo(x, Math.floor(oy + (y1 + 1) * cs) + 0.5);
      }
    } else {
      const bx = Math.floor(ox) + 0.5;
      const by = Math.floor(oy) + 0.5;
      const bw = Math.floor(cols * cs);
      const bh = Math.floor(rows * cs);
      ctx.rect(bx, by, bw, bh);
    }
    ctx.stroke();

    // stamp-brush ghost preview at hovered cell
    const b = brushRef.current;
    const hov = hoverRef.current;
    if (b && hov.inside) {
      const hx = Math.floor((hov.x - ox) / cs);
      const hy = Math.floor((hov.y - oy) / cs);
      const cells = patternCells(b);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [dx, dy] of cells) {
        if (dx < minX) minX = dx;
        if (dx > maxX) maxX = dx;
        if (dy < minY) minY = dy;
        if (dy > maxY) maxY = dy;
      }
      const ax = hx - Math.round((minX + maxX) / 2);
      const ay = hy - Math.round((minY + maxY) / 2);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = aliveRef.current;
      for (const [dx, dy] of cells) {
        const x = ax + dx;
        const y = ay + dy;
        if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
        ctx.fillRect(ox + x * cs, oy + y * cs, cs + 0.5, cs + 0.5);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- cell ops ----
  function cellAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { ox, oy, cs } = camRef.current;
    return {
      x: Math.floor((clientX - rect.left - ox) / cs),
      y: Math.floor((clientY - rect.top - oy) / cs),
    };
  }

  function setCell(x: number, y: number, v: 1 | 0) {
    const cols = colsRef.current;
    const rows = rowsRef.current;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    gridRef.current[y * cols + x] = v;
  }

  function paintSingle(x: number, y: number, v: 1 | 0) {
    const cols = colsRef.current;
    const rows = rowsRef.current;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    gridRef.current[y * cols + x] = v;
    bumpCells();
    setPop(count(gridRef.current));
  }

  function resizeWorld(nc: number, nr: number) {
    const oc = colsRef.current;
    const orw = rowsRef.current;
    nc = Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(nc)));
    nr = Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(nr)));
    if (nc === oc && nr === orw) return;
    // centered preserve: content stays in the middle
    const ng = new Uint8Array(nc * nr);
    const ox = Math.floor((nc - oc) / 2);
    const oy = Math.floor((nr - orw) / 2);
    const old = gridRef.current;
    for (let y = 0; y < orw; y++)
      for (let x = 0; x < oc; x++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= 0 && nx < nc && ny >= 0 && ny < nr) ng[ny * nc + nx] = old[y * oc + x];
      }
    gridRef.current = ng;
    bufRef.current = new Uint8Array(nc * nr);
    colsRef.current = nc;
    rowsRef.current = nr;
    bumpCells();
    setCols(nc);
    setRows(nr);
    setPop(count(ng));
  }

  function insideWorld(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const { ox, oy, cs } = camRef.current;
    return px >= ox && px <= ox + colsRef.current * cs && py >= oy && py <= oy + rowsRef.current * cs;
  }

  function updateHoverCursor(e: React.PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    if (spaceRef.current && !panRef.current) {
      canvas.style.cursor = "grab";
      return;
    }
    canvas.style.cursor = insideWorld(e.clientX, e.clientY) ? "crosshair" : "default";
  }

  function pauseForGesture() {
    wasRunningRef.current = runningRef.current;
    if (runningRef.current) setRunning(false);
  }
  function resumeAfterGesture() {
    if (wasRunningRef.current) {
      setRunning(true);
      wasRunningRef.current = false;
    }
  }

  // ---- pointer gestures ----
  function localPos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    canvas.setPointerCapture(e.pointerId);
    const p = localPos(e);
    hoverRef.current = { x: p.x, y: p.y, inside: true };
    pointersRef.current.set(e.pointerId, p);

    // right-click drops the stamp brush
    if (e.button === 2) {
      if (brushRef.current) setBrush(null);
      panRef.current = { id: e.pointerId, lx: p.x, ly: p.y };
      canvas.style.cursor = "grabbing";
      return;
    }

    // second finger → switch to pinch
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
      if (paintRef.current) {
        paintRef.current = null;
        resumeAfterGesture();
      }
      panRef.current = null;
      canvas.style.cursor = "grabbing";
      return;
    }

    if (e.button === 1 || spaceRef.current) {
      panRef.current = { id: e.pointerId, lx: p.x, ly: p.y };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button === 0) {
      // stamp brush: place pattern centered on click, stay armed
      if (brushRef.current) {
        const c = cellAt(e.clientX, e.clientY);
        const cols = colsRef.current;
        const rows = rowsRef.current;
        if (c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows) {
          stampCentered(gridRef.current, cols, rows, brushRef.current, c.x, c.y);
          bumpCells();
          setPop(count(gridRef.current));
        }
        return;
      }
      pauseForGesture();
      paintRef.current = { id: e.pointerId, erase: e.shiftKey, moved: false, sx: p.x, sy: p.y };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    lastClientRef.current = { x: e.clientX, y: e.clientY };
    const p = localPos(e);
    hoverRef.current = { x: p.x, y: p.y, inside: true };
    pointersRef.current.set(e.pointerId, p);

    // pinch: zoom + pan around midpoint
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const prev = pinchRef.current;
      if (prev.d > 0 && d > 0) {
        zoomAt(mx, my, d / prev.d);
        camRef.current.ox += mx - prev.mx;
        camRef.current.oy += my - prev.my;
      }
      pinchRef.current = { d, mx, my };
      return;
    }

    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      camRef.current.ox += p.x - pan.lx;
      camRef.current.oy += p.y - pan.ly;
      pan.lx = p.x;
      pan.ly = p.y;
      return;
    }

    const paint = paintRef.current;
    if (paint && paint.id === e.pointerId) {
      if (Math.hypot(p.x - paint.sx, p.y - paint.sy) > 5) paint.moved = true;
      if (paint.moved) {
        const c = cellAt(e.clientX, e.clientY);
        paintSingle(c.x, c.y, e.shiftKey ? 0 : 1);
      }
      return;
    }

    // idle hover: crosshair only over the world box
    updateHoverCursor(e);
  }

  function endPointer(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);

    if (pinchRef.current) {
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
        updateHoverCursor(e);
      }
      return;
    }
    if (panRef.current?.id === e.pointerId) {
      panRef.current = null;
      updateHoverCursor(e);
      return;
    }
    const paint = paintRef.current;
    if (paint && paint.id === e.pointerId) {
      paintRef.current = null;
      if (!paint.moved) {
        // click: toggle exactly one cell
        const c = cellAt(e.clientX, e.clientY);
        const cols = colsRef.current;
        const rows = rowsRef.current;
        if (c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows) {
          setCell(c.x, c.y, gridRef.current[c.y * cols + c.x] ? 0 : 1);
          bumpCells();
          setPop(count(gridRef.current));
        }
      }
      resumeAfterGesture();
    }
  }

  // ---- misc actions ----
  const doStep = () => {
    step(gridRef.current, bufRef.current, colsRef.current, rowsRef.current, bornRef.current, survRef.current);
    const t = gridRef.current;
    gridRef.current = bufRef.current;
    bufRef.current = t;
    setGen((g) => g + 1);
    setPop(count(gridRef.current));
  };
  const doRandom = () => {
    randomize(gridRef.current, density);
    setGen(0);
    bumpCells();
    setPop(count(gridRef.current));
  };
  const doClear = () => {
    gridRef.current.fill(0);
    setGen(0);
    bumpCells();
    setPop(0);
  };

  // ---- save & share ----
  const getCode = () =>
    encodeLife({
      w: colsRef.current,
      h: rowsRef.current,
      born,
      survives,
      alive: aliveColor,
      bg: bgColor,
      speed,
      runs: toRuns(gridRef.current),
    });
  /** Replace the whole world with a saved board (exact size, no centring). */
  const applySave = async (code: string) => {
    const sv = await decodeLife(code, MAX_DIM);
    if (!sv) throw new Error("not a Game of Life save");
    const w = Math.max(MIN_DIM, sv.w);
    const h = Math.max(MIN_DIM, sv.h);
    const grid = new Uint8Array(w * h);
    const src = fromRuns(sv.runs, sv.w * sv.h);
    for (let y = 0; y < sv.h; y++) grid.set(src.subarray(y * sv.w, (y + 1) * sv.w), y * w);
    gridRef.current = grid;
    bufRef.current = new Uint8Array(w * h);
    colsRef.current = w;
    rowsRef.current = h;
    setCols(w);
    setRows(h);
    setBorn(sv.born);
    setSurvives(sv.survives);
    setAliveColor(sv.alive);
    setBgColor(sv.bg);
    setSpeed(sv.speed);
    setGen(0);
    setPop(count(grid));
    bumpCells();
    recenter();
  };
  const setLink = useShareLink(applySave);

  const pushHistory = () => {
    setRuleHistory((h) => [...h.slice(-49), { born, survives }]);
  };
  const applyRule = (r: Rule) => {
    pushHistory();
    setBorn(r.born);
    setSurvives(r.survives);
  };
  const toggleCount = (list: number[], n: number) =>
    list.includes(n) ? list.filter((v) => v !== n) : [...list, n].sort((a, b) => a - b);
  const currentPresetId =
    RULE_PRESETS.find(
      (p) =>
        p.born.length === born.length && p.born.every((v, i) => v === born[i]) &&
        p.survives.length === survives.length && p.survives.every((v, i) => v === survives[i]),
    )?.id ?? "custom";

  return (
    <SimShell
      n="01"
      title="Game of Life"
      icon={<LayoutGrid size={24} />}
      accent="#4ade80"
      stats={
        <>
          <span>Pop <b>{pop}</b></span>
          <span>Gen <b>{gen}</b></span>
          <span className="flex items-center gap-1 font-mono" style={{ color: effective === "gpu" ? "#fde047" : undefined }}>
            <Zap size={11} className="inline" /> {effective === "gpu" ? "GPU" : "CPU"}
          </span>
        </>
      }
      meta={<span>{cols}×{rows} · B{born.join("")}/S{survives.join("")} · {Math.round(zoomPx)}px</span>}
      dock={
        <>
          <button type="button" title="Recenter view" aria-label="Recenter view" className={dockBtn} onClick={recenter}>
            <Focus size={19} />
          </button>
          <button type="button" title="Zoom out" aria-label="Zoom out" className={dockBtn} onClick={() => zoomStep(1 / 1.25)}>
            <ZoomOut size={19} />
          </button>
          <button
            type="button" title="Play or Pause" aria-label="Play or Pause"
            className={`${dockBtn} !size-14 !text-[22px]`} onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
          </button>
          <button type="button" title="Step one generation" aria-label="Step" className={dockBtn} disabled={running} onClick={doStep}>
            <SkipForward size={19} />
          </button>
          <button type="button" title="Zoom in" aria-label="Zoom in" className={dockBtn} onClick={() => zoomStep(1.25)}>
            <ZoomIn size={19} />
          </button>
        </>
      }
      quickActions={
        <>
          <button
            type="button" title="Toggle grid" aria-label="Toggle grid" onClick={() => setGridOn((v) => !v)}
            className={`${fabBtn} ${gridOn ? "!text-emerald-300" : "opacity-50"}`}
          >
            <LayoutGrid size={19} />
          </button>
          <button type="button" title="Randomize" aria-label="Randomize" className={fabBtn} onClick={doRandom}>
            <Dices size={19} />
          </button>
          <button type="button" title="Clear" aria-label="Clear" className={`${fabBtn} !bg-rose-800/80 hover:!bg-rose-700/80`} onClick={doClear}>
            <Trash2 size={19} />
          </button>
        </>
      }
      dockBelow={
        <label className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm" title="Speed">
          <Timer size={14} className="shrink-0" />
          <input type="range" min={1} max={60} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-28" />
          <span className="min-w-9 text-right font-mono">{speed}/s</span>
        </label>
      }
      controls={
        <>
          <Collapse label="Save & share" icon={<Save size={16} className="text-emerald-400" />}>
            <SavePanel
              sim="game-of-life"
              getCode={getCode}
              onShare={setLink}
              onLoad={async (code) => {
                await applySave(code);
                setLink(code);
              }}
              thumb={lifeThumb}
            />
          </Collapse>
          <Collapse label="Rules" icon={<Dna size={16} className="text-rose-400" />} opened>
            <div className="flex gap-2">
              <select
                aria-label="Rule preset"
                value={currentPresetId}
                onChange={(e) => {
                  const p = RULE_PRESETS.find((r) => r.id === e.target.value);
                  if (p) applyRule({ born: p.born, survives: p.survives });
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100"
              >
                {currentPresetId === "custom" && (
                  <option value="custom">Custom (B{born.join("")}/S{survives.join("")})</option>
                )}
                {RULE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="grid w-4/12 grid-cols-2 gap-1">
                <button
                  type="button" title="Undo rules" aria-label="Undo rules"
                  disabled={!ruleHistory.length}
                  onClick={() => {
                    const prev = ruleHistory[ruleHistory.length - 1];
                    if (!prev) return;
                    setRuleHistory((h) => h.slice(0, -1));
                    setBorn(prev.born);
                    setSurvives(prev.survives);
                  }}
                  className="flex items-center justify-center rounded-full bg-slate-800/80 px-3 hover:bg-slate-800/50 disabled:cursor-default disabled:opacity-40"
                >
                  <Undo2 size={16} />
                </button>
                <button
                  type="button" title="Randomize rules" aria-label="Randomize rules"
                  onClick={() => applyRule(randomRule())}
                  className="flex items-center justify-center rounded-full bg-cyan-900/80 px-3 hover:bg-cyan-900/50"
                >
                  <Dices size={16} />
                </button>
              </div>
            </div>
            <p className="mt-2 mb-1 text-[15px] text-slate-300">
              Born - <span className="font-mono text-white">B{born.join("")}</span>
              <Tip text="A dead cell becomes alive if it has exactly this many alive neighbors." />
            </p>
            <div className="grid grid-cols-9 gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={`born-${n}`} type="button" onClick={() => { pushHistory(); setBorn((b) => toggleCount(b, n)); }}
                  className={`rounded-lg border py-1.5 font-mono text-xs font-medium ${
                    born.includes(n)
                      ? "border-emerald-600 bg-emerald-600/20 text-emerald-100"
                      : "border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-900/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 mb-1 text-[15px] text-slate-300">
              Survives - <span className="font-mono text-white">S{survives.join("")}</span>
              <Tip text="A living cell stays alive if it has exactly this many alive neighbors." />
            </p>
            <div className="grid grid-cols-9 gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={`surv-${n}`} type="button" onClick={() => { pushHistory(); setSurvives((s) => toggleCount(s, n)); }}
                  className={`rounded-lg border py-1.5 font-mono text-xs font-medium ${
                    survives.includes(n)
                      ? "border-emerald-600 bg-emerald-600/20 text-emerald-100"
                      : "border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-900/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Collapse>
          <Collapse label="World" icon={<Globe size={16} className="text-cyan-400" />} opened>
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
                  }`}
                >
                  CPU
                </button>
              </div>
            </div>
            {gpuSup !== "yes" && <p className="text-xs opacity-80">WebGPU unavailable in this browser — CPU engine only.</p>}
            {gpuSup === "yes" && !gpuOn && <p className="text-xs opacity-80">GPU acceleration is off — enable it from the hub navbar.</p>}
            {gpuErr && <p className="text-xs text-rose-300">GPU engine failed — fell back to CPU.</p>}
            <div className="mb-2 flex items-center gap-1.5">
              <span className="shrink-0 text-[15px] text-slate-300">Size</span>
              <SizeInput label="W" value={cols} min={MIN_DIM} max={MAX_DIM} aria="World width" onCommit={(v) => linked ? resizeWorld(v, Math.round(rows * v / cols)) : resizeWorld(v, rows)} />
              <SizeInput label="H" value={rows} min={MIN_DIM} max={MAX_DIM} aria="World height" onCommit={(v) => linked ? resizeWorld(Math.round(cols * v / rows), v) : resizeWorld(cols, v)} />
              <button
                type="button" title={linked ? "Unlink proportions" : "Link proportions"} aria-label="Link proportions"
                onClick={() => setLinked((l) => !l)}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-950/90 text-slate-200 hover:bg-slate-950/50"
              >
                {linked ? <Link2 size={15} /> : <Unlink size={15} />}
              </button>
            </div>
            <Slider label="Speed (gen/s)" value={speed} min={1} max={60} onChange={setSpeed} tip="Generations computed per second." />
            <div className="mt-1.5">
              <Slider label="Soup density" value={Math.round(density * 100)} min={5} max={50} unit="%" onChange={(v) => setDensity(v / 100)} tip="Fraction of cells alive after randomize." />
            </div>
            <div className="mt-1.5">
              <Toggle label="Show grid" checked={gridOn} onChange={setGridOn} tip="Cell grid lines (auto-simplified when zoomed out)." />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5 text-[13px]">
                <input
                  type="color" value={aliveColor} onChange={(e) => setAliveColor(e.target.value)}
                  aria-label="Alive cell color"
                  className="h-7 w-9 cursor-pointer rounded border border-slate-600 bg-transparent p-0.5"
                />
                <span className="flex flex-col leading-tight">
                  <span className="text-slate-300">Alive</span>
                  <span className="font-mono text-[11px] text-slate-400">{aliveColor}</span>
                </span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5 text-[13px]">
                <input
                  type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                  aria-label="Background color"
                  className="h-7 w-9 cursor-pointer rounded border border-slate-600 bg-transparent p-0.5"
                />
                <span className="flex flex-col leading-tight">
                  <span className="text-slate-300">Void</span>
                  <span className="font-mono text-[11px] text-slate-400">{bgColor}</span>
                </span>
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className={`${ctlBtn} flex items-center justify-center gap-1.5`} onClick={doRandom}><Dices size={15} /> Randomize</button>
              <button className={`${ctlBtn} flex items-center justify-center gap-1.5`} onClick={doClear}><Trash2 size={15} /> Clear</button>
            </div>
            <p className="text-xs opacity-80">Scroll to zoom · drag to paint · space / right-drag to pan · click toggles one cell.</p>
          </Collapse>
          <Collapse label="Patterns" icon={<Sparkles size={16} className="text-amber-400" />} opened>
            <div className="grid grid-cols-2 gap-2">
              {(["glider", "lwss", "pulsar", "gun"] as const).map((name) => {
                const label = name === "glider" ? "Glider" : name === "lwss" ? "Spaceship" : name === "pulsar" ? "Pulsar" : "Gosper gun";
                const active = brush === name;
                return (
                  <button
                    key={name}
                    className={`${ctlBtn} ${active ? "!border-emerald-500 !bg-emerald-500/10 !text-emerald-200" : ""}`}
                    onClick={() => setBrush((b) => (b === name ? null : name))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs opacity-80">
              {brush ? "Click the canvas to stamp — right-click or Esc to drop the brush." : "Pick a pattern, then click the canvas to stamp it."}
            </p>
          </Collapse>
        </>
      }
    >
      <figure ref={stageRef as React.RefObject<HTMLElement | null>} className="absolute inset-0 m-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={() => { hoverRef.current.inside = false; }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </figure>
    </SimShell>
  );
}
