import { FlaskConical, Zap, ZapOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useGpuEnabled, useWebGPU } from "../lib/gpu.js";

const REPO_URL = "https://github.com/shakthi-sagar/artificial-life";

/** Official GitHub mark (lucide v1 dropped brand icons), 16px grid. */
function GithubMark({ size = 19 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Top nav for hub pages. Hidden on sim routes (canvas owns the screen there). */
export function NavBar() {
  const gpuSup = useWebGPU();
  const [gpuOn, setGpuOn] = useGpuEnabled();
  return (
    <nav
      className="fixed top-0 right-0 left-0 z-50 flex justify-center bg-[#090909]/70 px-3 py-2 backdrop-blur-sm"
      style={{ boxShadow: "0 2px 8px 0 rgba(0,0,0,.5)" }}
    >
      <div className="container flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/" title="Home" aria-label="Home" className="flex items-center gap-1.5">
            <span className="grid size-6 place-items-center rounded-md bg-emerald-500/15 text-emerald-400">
              <FlaskConical size={16} />
            </span>
            <span className="font-semibold text-zinc-100">Artificial Life Lab</span>
          </Link>
        </div>
        <div className="flex items-center">
          {gpuSup === "yes" && (
            <button
              type="button"
              title={gpuOn ? "GPU acceleration on — sims use WebGPU automatically" : "GPU acceleration off — sims use CPU"}
              aria-label="Toggle GPU acceleration"
              onClick={() => setGpuOn(!gpuOn)}
              className={`mr-3 flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                gpuOn
                  ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                  : "border-slate-700 bg-slate-800/60 text-slate-400 hover:bg-slate-800"
              }`}
            >
              {gpuOn ? <Zap size={13} /> : <ZapOff size={13} />}
              GPU {gpuOn ? "on" : "off"}
            </button>
          )}
          {gpuSup !== "yes" && (
            <span className="mr-3 flex items-center gap-1 rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-500">
              <ZapOff size={13} /> WebGPU n/a
            </span>
          )}
          <a
            href={REPO_URL}
            title="Repository"
            aria-label="Repository"
            target="_blank"
            rel="noreferrer"
            className="flex p-1 text-zinc-400 hover:text-zinc-100"
          >
            <GithubMark />
          </a>
        </div>
      </div>
    </nav>
  );
}
