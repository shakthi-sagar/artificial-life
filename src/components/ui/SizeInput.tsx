import { useEffect, useState } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  aria: string;
  onCommit: (v: number) => void;
};

export function SizeInput({ label, value, min, max, aria, onCommit }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Math.round(Number(text));
    if (!Number.isNaN(v)) onCommit(Math.min(max, Math.max(min, v)));
    else setText(String(value));
  };
  return (
    <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={aria}
        className="w-full bg-transparent text-right font-mono text-sm text-slate-100 outline-none"
      />
    </label>
  );
}
