import { useRef, useState } from "react";

export type Ranges = { min: [number, number]; max: [number, number] };
type Handle = "minA" | "minB" | "maxA" | "maxB";

const VIEW = 300;
const CENTER = VIEW / 2;
const MAX_VISUAL_R = 132;
const R_MAX = 200;

const MIN_COLOR = "#22d3ee";
const MIN_BRIGHT = "#a5f3fc";
const MAX_COLOR = "#fcd34d";
const MAX_BRIGHT = "#fef3c7";
const GRID = "#94a3b8";

const HANDLE_META: Record<Handle, { label: string; color: string; bright: string }> = {
  minA: { label: "min", color: MIN_COLOR, bright: MIN_BRIGHT },
  minB: { label: "min", color: MIN_COLOR, bright: MIN_BRIGHT },
  maxA: { label: "max", color: MAX_COLOR, bright: MAX_BRIGHT },
  maxB: { label: "max", color: MAX_COLOR, bright: MAX_BRIGHT },
};

function niceStep(max: number) {
  if (max <= 0) return 10;
  const rough = max / 5;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  if (norm <= 1.5) return mag;
  if (norm <= 3.5) return 2 * mag;
  if (norm <= 7.5) return 5 * mag;
  return 10 * mag;
}

type Props = {
  ranges: Ranges;
  onChange: (r: Ranges) => void;
};

/**
 * Radial radius-range visualizer: drag the four handles to set where
 * attraction starts (min) and ends (max). Zones show the randomized band.
 */
export function RadiusVisualizer({ ranges, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<Handle | null>(null);
  const drag = useRef<{ id: Handle; startDist: number; startVal: number } | null>(null);

  const dataMax = Math.max(ranges.min[0], ranges.min[1], ranges.max[0], ranges.max[1], 10);
  const step = niceStep(dataMax);
  const renderMax = Math.max(step * 2, Math.ceil((dataMax * 1.12) / step) * step);
  const pxPerUnit = MAX_VISUAL_R / renderMax;

  const v = (h: Handle) =>
    h === "minA" ? ranges.min[0] : h === "minB" ? ranges.min[1] : h === "maxA" ? ranges.max[0] : ranges.max[1];
  const r = (h: Handle) => v(h) * pxPerUnit;

  const gridLines: { radius: number; label: number }[] = [];
  for (let val = step; val <= renderMax + 0.001; val += step) gridLines.push({ radius: val * pxPerUnit, label: Math.round(val) });
  const subTicks: number[] = [];
  for (let val = step / 2; val <= renderMax; val += step / 2) {
    if (Math.abs(val % step) > 0.001) subTicks.push(val * pxPerUnit);
  }

  /** Enforce 0 ≤ minLo ≤ minHi ≤ maxLo ≤ maxHi ≤ R_MAX. */
  const commit = (id: Handle, raw: number) => {
    const next: Ranges = { min: [...ranges.min] as [number, number], max: [...ranges.max] as [number, number] };
    const val = Math.round(Math.min(R_MAX, Math.max(0, raw)));
    if (id === "minA") {
      next.min[0] = Math.min(val, next.min[1]);
    } else if (id === "minB") {
      next.min[1] = Math.max(val, next.min[0]);
      next.max[0] = Math.max(next.max[0], next.min[1]);
    } else if (id === "maxA") {
      next.max[0] = Math.max(val, next.min[1]);
      next.max[1] = Math.max(next.max[1], next.max[0]);
    } else {
      next.max[1] = Math.max(val, next.max[0]);
    }
    onChange(next);
  };

  const svgScale = () => {
    const rect = svgRef.current!.getBoundingClientRect();
    return VIEW / rect.width;
  };

  const distFrom = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const s = VIEW / rect.width;
    const x = (e.clientX - rect.left) * s - CENTER;
    const y = (e.clientY - rect.top) * s - CENTER;
    return Math.hypot(x, y);
  };

  const nearestHandle = (e: React.PointerEvent): Handle | null => {
    const d = distFrom(e);
    const s = svgScale();
    let best: Handle | null = null;
    let bestGap = 24 * s;
    (["minA", "minB", "maxA", "maxB"] as Handle[]).forEach((h) => {
      const gap = Math.abs(d - r(h));
      if (gap < bestGap) {
        bestGap = gap;
        best = h;
      }
    });
    return best;
  };

  const onDown = (e: React.PointerEvent) => {
    const h = nearestHandle(e);
    if (!h) return;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    drag.current = { id: h, startDist: distFrom(e), startVal: v(h) };
    setActive(h);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = distFrom(e);
    const delta = (d - drag.current.startDist) / pxPerUnit;
    commit(drag.current.id, drag.current.startVal + delta);
  };

  const onUp = () => {
    drag.current = null;
    setActive(null);
  };

  const activeR = active ? r(active) : 0;
  const activeMeta = active ? HANDLE_META[active] : null;
  const labelY = Math.max(20, CENTER - activeR - 10);
  const minFont = Math.max(8, Math.min((r("minB") - r("minA")) * 0.42, 15));
  const maxFont = Math.max(8, Math.min((r("maxB") - r("maxA")) * 0.42, 15));

  const band = (a: Handle, b: Handle, color: string, opacity: number) => {
    const ra = r(a);
    const rb = r(b);
    return rb > ra ? (
      <circle cx={CENTER} cy={CENTER} r={(ra + rb) / 2} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={rb - ra} />
    ) : null;
  };

  return (
    <div className="overflow-hidden rounded-[0.6rem] border border-slate-500/35 bg-slate-950/50">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className={`w-full touch-none select-none ${drag.current ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <defs>
          <radialGradient id="rv-glow">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#94a3b8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#64748b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rv-vignette">
            <stop offset="65%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(2,6,15,0.35)" />
          </radialGradient>
          <filter id="rv-pglow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rv-sglow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={CENTER} cy={CENTER} r={MAX_VISUAL_R + 8} fill="url(#rv-vignette)" />
        <circle cx={CENTER} cy={CENTER} r={MAX_VISUAL_R + 6} fill="none" stroke={GRID} strokeOpacity="0.35" strokeWidth="0.5" />

        {gridLines.map((g) => (
          <circle key={`g${g.label}`} cx={CENTER} cy={CENTER} r={g.radius} fill="none" stroke={GRID} strokeOpacity="0.25" strokeWidth="0.5" strokeDasharray="3 6" />
        ))}

        <line x1={CENTER - MAX_VISUAL_R - 4} y1={CENTER} x2={CENTER + MAX_VISUAL_R + 4} y2={CENTER} stroke={GRID} strokeOpacity="0.35" strokeWidth="0.5" />
        <line x1={CENTER} y1={CENTER - MAX_VISUAL_R - 4} x2={CENTER} y2={CENTER + MAX_VISUAL_R + 4} stroke={GRID} strokeOpacity="0.35" strokeWidth="0.5" />

        {gridLines.map((g) => (
          <g key={`t${g.label}`}>
            <line x1={CENTER + g.radius} y1={CENTER - 4} x2={CENTER + g.radius} y2={CENTER + 4} stroke={GRID} strokeOpacity="0.55" strokeWidth="0.5" />
            <line x1={CENTER - g.radius} y1={CENTER - 4} x2={CENTER - g.radius} y2={CENTER + 4} stroke={GRID} strokeOpacity="0.55" strokeWidth="0.5" />
            <line x1={CENTER - 4} y1={CENTER + g.radius} x2={CENTER + 4} y2={CENTER + g.radius} stroke={GRID} strokeOpacity="0.55" strokeWidth="0.5" />
            <line x1={CENTER - 4} y1={CENTER - g.radius} x2={CENTER + 4} y2={CENTER - g.radius} stroke={GRID} strokeOpacity="0.55" strokeWidth="0.5" />
            <text x={CENTER + g.radius} y={CENTER - 7} textAnchor="middle" fill={GRID} fillOpacity="0.45" fontSize="7">
              {g.label}
            </text>
            <text x={CENTER - g.radius} y={CENTER - 7} textAnchor="middle" fill={GRID} fillOpacity="0.45" fontSize="7">
              {g.label}
            </text>
          </g>
        ))}

        {subTicks.map((rr, i) => (
          <g key={`s${i}`}>
            <line x1={CENTER + rr} y1={CENTER - 2} x2={CENTER + rr} y2={CENTER + 2} stroke={GRID} strokeOpacity="0.35" strokeWidth="0.5" />
            <line x1={CENTER - rr} y1={CENTER - 2} x2={CENTER - rr} y2={CENTER + 2} stroke={GRID} strokeOpacity="0.35" strokeWidth="0.5" />
            <line x1={CENTER - 2} y1={CENTER + rr} x2={CENTER + 2} y2={CENTER + rr} stroke={GRID} strokeOpacity="0.35" strokeWidth="0.5" />
            <line x1={CENTER - 2} y1={CENTER - rr} x2={CENTER + 2} y2={CENTER - rr} stroke={GRID} strokeOpacity="0.35" strokeWidth="0.5" />
          </g>
        ))}

        {band("maxA", "maxB", MAX_COLOR, 0.45)}
        {band("minA", "minB", MIN_COLOR, 0.4)}

        <text x={CENTER} y={CENTER + (r("minA") + r("minB")) / 2} textAnchor="middle" dy="0.15em" fontSize={minFont} fontWeight="800" stroke="#020617" strokeOpacity="0.8" strokeWidth={minFont * 0.08} strokeLinejoin="round" paintOrder="stroke" fill={MIN_COLOR} pointerEvents="none">
          MIN
        </text>
        <text x={CENTER} y={CENTER + (r("maxA") + r("maxB")) / 2} textAnchor="middle" dy="0.25em" fontSize={maxFont} fontWeight="800" stroke="#020617" strokeOpacity="0.8" strokeWidth={maxFont * 0.08} strokeLinejoin="round" paintOrder="stroke" fill={MAX_COLOR} pointerEvents="none">
          MAX
        </text>

        {(["minA", "minB", "maxA", "maxB"] as Handle[]).map((h) => {
          const on = active === h;
          const meta = HANDLE_META[h];
          return (
            <circle
              key={h}
              cx={CENTER}
              cy={CENTER}
              r={Math.max(0.5, r(h))}
              fill="none"
              stroke={on ? meta.bright : meta.color}
              strokeWidth={on ? 1.9 : 1.2}
              strokeOpacity={on ? 1 : 0.7}
              strokeDasharray={on ? "none" : "3 4"}
              filter={on ? "url(#rv-sglow)" : undefined}
            />
          );
        })}

        {active && activeMeta && (
          <>
            <circle cx={CENTER + activeR} cy={CENTER} r="4" fill="none" stroke={activeMeta.bright} strokeWidth="1.5" />
            <circle cx={CENTER + activeR} cy={CENTER} r="2.4" fill={activeMeta.bright} />
            <text x={CENTER} y={labelY} textAnchor="middle" fontSize="6" fontWeight="700" fill={activeMeta.bright} stroke="#020617" strokeOpacity="0.9" strokeWidth="2.5" paintOrder="stroke" opacity="0.75">
              {activeMeta.label}
            </text>
            <text x={CENTER} y={labelY + 11} textAnchor="middle" fontSize="11" fontWeight="700" fill={activeMeta.bright} stroke="#020617" strokeOpacity="0.9" strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke">
              {Math.round(v(active))}u
            </text>
          </>
        )}

        <circle cx={CENTER} cy={CENTER} r="8" fill="url(#rv-glow)" />
        <circle cx={CENTER} cy={CENTER} r="2" fill="#e2e8f0" filter="url(#rv-pglow)" opacity="0.8" />
      </svg>
    </div>
  );
}
