export type SegmentOption<T extends string | number> = {
  id: T;
  label: string;
  icon?: React.ReactNode;
};

type Props<T extends string | number> = {
  name: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
};

/** OptionBar clone: segmented radio grid, slate-900 active pill. */
export function Segmented<T extends string | number>({ name, value, options, onChange }: Props<T>) {
  return (
    <div
      className="grid w-full gap-1 rounded-xl bg-slate-700/80 p-[3px] text-sm"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((opt) => (
        <div key={String(opt.id)}>
          <input
            type="radio"
            name={name}
            id={`${name}-${opt.id}`}
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
            className="peer hidden"
          />
          <label
            htmlFor={`${name}-${opt.id}`}
            className="block cursor-pointer rounded-lg px-2 py-0.5 text-center text-slate-300 select-none hover:bg-slate-800/80 peer-checked:bg-slate-900/80 peer-checked:font-bold peer-checked:text-white"
          >
            {opt.icon}
            {opt.label}
          </label>
        </div>
      ))}
    </div>
  );
}
