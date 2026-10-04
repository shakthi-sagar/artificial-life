import { ChevronLeft, House, Settings } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  n: string;
  title: string;
  icon?: ReactNode;
  accent?: string;
  /** first ribbon: e.g. gen + pop */
  stats?: ReactNode;
  /** second dimmer ribbon: e.g. grid dims */
  meta?: ReactNode;
  /** drawer body */
  controls?: ReactNode;
  /** bottom-center floating dock */
  dock?: ReactNode;
  /** centered strip below the dock (e.g. speed pill) */
  dockBelow?: ReactNode;
  /** bottom-right quick actions */
  quickActions?: ReactNode;
  /** optional right-hand sidebar (same slide-over style as the settings drawer) */
  aside?: ReactNode;
  asideLabel?: string;
  asideIcon?: ReactNode;
  children: ReactNode;
};

const WIDTH = 340;
const ASIDE = 290;

export function SimShell({
  n,
  title,
  icon,
  accent = "#4ade80",
  stats,
  meta,
  controls,
  dock,
  dockBelow,
  quickActions,
  aside,
  asideLabel = "Panel",
  asideIcon,
  children,
}: Props) {
  const [open, setOpen] = useState(true);
  // the right panel starts open on screens wide enough for both sides
  const [asideOpen, setAsideOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 900);

  return (
    <section
      className="relative h-dvh overflow-hidden bg-[#07090d]"
      style={{ ["--accent" as string]: accent }}
    >
      {/* stage fills everything */}
      {children}

      {/* top-left: home + settings edge tabs, slide with drawer */}
      <div
        className="absolute top-0 left-0 z-30 transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${open ? WIDTH : 0}px)` }}
      >
        <Link
          to="/"
          title="Home"
          aria-label="Home"
          className="absolute top-0 left-0 rounded-br-[20px] border border-t-0 border-l-0 border-slate-500 bg-slate-900/85 p-2 text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-950/85"
        >
          <House size={22} />
        </Link>
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={() => setOpen((o) => !o)}
          className="absolute top-[52px] left-0 flex flex-col items-center gap-1 rounded-r-[20px] border border-l-0 border-slate-500 bg-cyan-900/85 py-3 pr-2 pl-1.5 text-[13px] font-semibold text-sky-100 backdrop-blur-sm transition-colors hover:bg-cyan-950/85"
        >
          <span className="relative flex">
            {!open && (
              <Settings size={14} className="absolute inset-0 animate-ping-slow opacity-75" />
            )}
            <Settings size={18} className="relative" />
          </span>
          <span className="rotate-180 [writing-mode:vertical-rl]">Settings</span>
        </button>
      </div>

      {/* slide-over drawer */}
      <div
        className="absolute inset-y-0 left-0 z-40 max-w-[calc(100vw-60px)] border-r border-slate-500/50 transition-transform duration-300 ease-out"
        style={{ width: WIDTH, transform: open ? "translateX(0)" : "translateX(-100%)" }}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col bg-[#050818]/70 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2.5 pt-3.5 pr-0 pb-2.5 pl-3">
            <span style={{ color: accent }}>{icon}</span>
            <div>
              <p className="font-mono text-[11px] text-slate-400">{n}</p>
              <h1 className="text-lg font-extrabold tracking-wider text-[#dff6f3] drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">
                {title}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close settings"
              className="ml-auto rounded-l-lg border border-r-0 border-slate-600 bg-slate-900/85 p-1 text-slate-100 hover:bg-slate-950/85"
            >
              <ChevronLeft size={22} />
            </button>
          </div>
          <hr className="border-slate-500" />
          <div className="drawer-scroll flex flex-1 flex-col gap-2 overflow-y-auto px-2 pt-2 pb-12">
            {controls}
          </div>
        </div>
      </div>

      {/* right sidebar: edge tab + slide-over panel */}
      {aside && (
        <>
          <div
            className="absolute top-[52px] right-0 z-30 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${asideOpen ? -ASIDE : 0}px)` }}
          >
            <button
              type="button"
              title={asideLabel}
              aria-label={asideLabel}
              onClick={() => setAsideOpen((o) => !o)}
              className="flex flex-col items-center gap-1 rounded-l-[20px] border border-r-0 border-slate-500 bg-cyan-900/85 py-3 pr-1.5 pl-2 text-[13px] font-semibold text-sky-100 backdrop-blur-sm transition-colors hover:bg-cyan-950/85"
            >
              <span className="flex">{asideIcon}</span>
              <span className="[writing-mode:vertical-rl]">{asideLabel}</span>
            </button>
          </div>
          <div
            className="absolute inset-y-0 right-0 z-40 max-w-[calc(100vw-60px)] border-l border-slate-500/50 transition-transform duration-300 ease-out"
            style={{ width: ASIDE, transform: asideOpen ? "translateX(0)" : "translateX(100%)" }}
            aria-hidden={!asideOpen}
          >
            <div className="flex h-full flex-col bg-[#050818]/70 shadow-xl backdrop-blur-md">{aside}</div>
          </div>
        </>
      )}

      {/* top-right stats ribbons */}
      {(stats || meta) && (
        <div
          className="pointer-events-none absolute top-0 right-0 z-20 flex flex-col items-end text-xs transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${aside && asideOpen ? -ASIDE : 0}px)` }}
        >
          {stats && (
            <div className="flex gap-3 rounded-bl-xl bg-slate-800/75 py-0.5 pr-2 pl-3.5 text-slate-300 [&_b]:font-mono [&_b]:text-white">
              {stats}
            </div>
          )}
          {meta && (
            <div className="mt-px rounded-bl-xl bg-slate-800/60 py-0.5 pr-2 pl-3 text-slate-400 opacity-65">
              {meta}
            </div>
          )}
        </div>
      )}

      {/* bottom-right quick actions */}
      {quickActions && (
        <div
          className="absolute right-2 bottom-2 z-20 flex flex-col items-end gap-1.5 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${aside && asideOpen ? -ASIDE : 0}px)` }}
        >
          {quickActions}
        </div>
      )}

      {/* bottom-center dock + strip below */}
      {(dock || dockBelow) && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
          {dock && <div className="flex items-end gap-1.5">{dock}</div>}
          {dockBelow}
        </div>
      )}
    </section>
  );
}
