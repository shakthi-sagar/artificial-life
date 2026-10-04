import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

type Props = {
  label: string;
  icon?: ReactNode;
  opened?: boolean;
  children: ReactNode;
};

export function Collapse({ label, icon, opened = false, children }: Props) {
  const [isOpen, setIsOpen] = useState(opened);
  return (
    <section className="w-full">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={`flex w-full cursor-pointer items-center justify-between px-4 py-1 transition-colors hover:bg-slate-600/50 ${
          isOpen ? "rounded-t-[18px] bg-slate-700/30 shadow-lg" : "rounded-full bg-slate-700/50"
        }`}
      >
        <span className="flex items-center gap-2 text-sm">
          {icon}
          {label}
        </span>
        <ChevronDown size={22} className={`text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="rounded-b-xl bg-slate-700/30 p-2 text-[13px] text-slate-300 [&_p]:my-2 [&_p]:mx-0.5 [&_p]:leading-relaxed">
          {children}
        </div>
      )}
    </section>
  );
}
