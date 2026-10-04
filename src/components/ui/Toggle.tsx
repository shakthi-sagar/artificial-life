type Props = {
  label?: string;
  inactiveLabel?: string;
  checked: boolean;
  tip?: string;
  onChange: (v: boolean) => void;
};

/** ToggleSwitch clone: label left, teal switch right. Track #0C7489 on, #07404B off. */
export function Toggle({ label, inactiveLabel, checked, tip, onChange }: Props) {
  const text = label ?? inactiveLabel ?? "";
  return (
    <div className="flex items-center justify-between gap-3">
      {text && (
        <p className="pt-0.5 text-[15px] text-slate-300" title={tip}>
          {text}
        </p>
      )}
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={() => onChange(!checked)}
          aria-label={text || "toggle"}
        />
        <span
          className="relative block h-[22px] w-10 rounded-full bg-[#07404B] transition-colors peer-checked:bg-[#0C7489]
            after:absolute after:top-[2px] after:left-[2px] after:h-[18px] after:w-[18px] after:rounded-full
            after:border after:border-gray-300 after:bg-gray-200 after:transition-transform
            peer-checked:after:translate-x-[18px] peer-checked:after:border-white peer-checked:after:bg-white"
        />
      </label>
    </div>
  );
}
