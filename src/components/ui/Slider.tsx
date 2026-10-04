type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  input?: boolean;
  tip?: string;
  onChange: (v: number) => void;
};

/**
 * RangeInput clone: label + mono value, custom track with teal fill + knob,
 * invisible native range on top for a11y, optional numeric input.
 */
export function Slider({ label, value, min, max, step = 1, unit = "", input = false, tip, onChange }: Props) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-2">
      <p className="w-2/3 text-[15px] text-slate-300" title={tip}>
        {label}
      </p>
      <div className="flex w-full items-center">
        <div className="relative mx-2 flex-1">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={label}
            className="absolute top-1/2 left-0 z-20 h-4 w-full -translate-y-1/2 cursor-pointer opacity-0"
          />
          <div className="relative z-10 flex h-2 items-center">
            <div className="absolute inset-0 rounded-md bg-gray-200" />
            <div className="absolute top-0 bottom-0 left-0 z-20 rounded-md bg-[#0C7489]" style={{ right: `${100 - pct}%` }} />
            <div
              className="absolute z-30 h-[18px] w-[18px] -translate-x-1/2 rounded-full bg-[#0A5F71]"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
        {input ? (
          <input
            type="text"
            inputMode="decimal"
            maxLength={6}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            aria-label={`${label} value`}
            className="w-14 rounded border border-gray-200 bg-white text-center text-sm font-medium text-black"
          />
        ) : (
          <span className="min-w-10 text-right font-mono text-xs text-slate-300">
            {value}
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
