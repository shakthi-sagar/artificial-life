import { Dices } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { Slider } from "../../components/ui/Slider.js";

export type MatrixTarget = "force" | "min" | "max";
export const R_MAX = 200;

type Props = {
  n: number;
  colors: string[];
  rules: Float32Array;
  minR: Float32Array;
  maxR: Float32Array;
  target: MatrixTarget;
  onTarget: (t: MatrixTarget) => void;
  version: number;
  onPaint: (a: number, b: number, v: number) => void;
  onRandomize: () => void;
};

function cellBg(v: number, target: MatrixTarget) {
  if (target !== "force") {
    const t = Math.min(1, Math.max(0, v / R_MAX));
    return `rgba(34, 211, 238, ${0.06 + t * 0.8})`;
  }
  const t = Math.min(1, Math.abs(v));
  return v >= 0
    ? `rgba(74, 222, 128, ${0.08 + t * 0.75})`
    : `rgba(248, 113, 113, ${0.08 + t * 0.75})`;
}

/**
 * Matrix editor for the three per-pair matrices: force, min radius, max radius.
 * Click/drag paints; the slider edits the selected cell, or everything when none.
 */
export function MatrixEditor({
  n,
  colors,
  rules,
  minR,
  maxR,
  target,
  onTarget,
  version,
  onPaint,
  onRandomize,
}: Props) {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [brushForce, setBrushForce] = useState(0.6);
  const [brushRadius, setBrushRadius] = useState(40);
  const painting = useRef(false);

  const read = (a: number, b: number) => {
    const i = a * n + b;
    if (target === "force") return rules[i];
    return target === "min" ? minR[i] : maxR[i];
  };

  const applySlider = (v: number) => {
    if (target === "force") setBrushForce(v);
    else setBrushRadius(v);
    if (sel) onPaint(sel[0], sel[1], v);
    else for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) onPaint(a, b, v);
  };

  const paintAt = (a: number, b: number) => {
    setSel([a, b]);
    onPaint(a, b, target === "force" ? brushForce : brushRadius);
  };

  const selVal = sel ? read(sel[0], sel[1]) : 0;

  return (
    <div>
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-700/80 p-[3px] text-xs">
        {(
          [
            ["force", "Force"],
            ["min", "Min R"],
            ["max", "Max R"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTarget(id)}
            className={`rounded-lg px-2 py-1 transition-colors ${
              target === id ? "bg-slate-900/80 font-bold text-white" : "text-slate-300 hover:bg-slate-800/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] text-slate-400">
          {sel ? (
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full" style={{ background: colors[sel[0]] }} />
              →
              <span className="size-3.5 rounded-full" style={{ background: colors[sel[1]] }} />
              <span className="ml-1 font-mono text-slate-200">
                {target === "force" ? selVal.toFixed(2) : `${Math.round(selVal)}u`}
              </span>
            </span>
          ) : (
            "All pairs"
          )}
        </p>
        <div className="flex gap-1.5">
          {sel && (
            <button
              type="button"
              onClick={() => setSel(null)}
              className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
            >
              All
            </button>
          )}
          <button
            type="button"
            title="Randomize matrix"
            aria-label="Randomize matrix"
            onClick={onRandomize}
            className="flex items-center gap-1 rounded-lg bg-cyan-900/80 px-2.5 py-1 text-xs text-slate-100 hover:bg-cyan-900/50"
          >
            <Dices size={14} /> Dice
          </button>
        </div>
      </div>

      <div
        className="grid aspect-square w-full gap-px"
        style={{ gridTemplateColumns: `repeat(${n + 1}, minmax(0, 1fr))` }}
        key={`${version}-${target}`}
      >
        <div className="p-[12%]">
          <div className="h-full w-full rounded-full bg-black" />
        </div>
        {colors.map((c, j) => (
          <div key={`h${j}`} className="p-[12%]">
            <div className="h-full w-full rounded-full" style={{ background: c }} />
          </div>
        ))}
        {Array.from({ length: n }, (_, a) => (
          <Fragment key={`row${a}`}>
            <div className="p-[12%]">
              <div className="h-full w-full rounded-full" style={{ background: colors[a] }} />
            </div>
            {Array.from({ length: n }, (_, b) => {
              const v = read(a, b);
              const active = sel?.[0] === a && sel?.[1] === b;
              return (
                <div
                  key={`${a}-${b}`}
                  title={`${a} → ${b}: ${target === "force" ? v.toFixed(2) : `${Math.round(v)}u`}`}
                  onPointerDown={(e) => {
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    painting.current = true;
                    paintAt(a, b);
                  }}
                  onPointerEnter={() => painting.current && paintAt(a, b)}
                  onPointerUp={() => (painting.current = false)}
                  className={`cursor-ew-resize touch-none select-none ${
                    active ? "ring-2 ring-white ring-inset" : ""
                  }`}
                  style={{ background: cellBg(v, target) }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-2">
        {target === "force" ? (
          <Slider
            label="Force"
            value={Math.round(brushForce * 100)}
            min={-100}
            max={100}
            unit="%"
            onChange={(v) => applySlider(v / 100)}
          />
        ) : (
          <Slider
            label={target === "min" ? "Min radius" : "Max radius"}
            value={Math.round(brushRadius)}
            min={0}
            max={R_MAX}
            unit="u"
            input
            onChange={(v) => applySlider(v)}
          />
        )}
      </div>
    </div>
  );
}
