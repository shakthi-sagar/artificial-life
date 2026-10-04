import { Eye, FlaskConical, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { NavBar } from "../components/NavBar.js";
import { useGpuEnabled, useWebGPU } from "../lib/gpu.js";
import { SIMS } from "../sims.js";

export function Dashboard() {
  const gpuSup = useWebGPU();
  const [gpuOn] = useGpuEnabled();
  const gpuReady = gpuSup === "yes" && gpuOn;

  return (
    <>
      <NavBar />
      <div className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <header className="flex flex-col items-center text-center sm:flex-row sm:text-left">
          <div className="mr-0 mb-4 flex items-start justify-center sm:mr-6 sm:mb-0">
            <span className="grid size-20 place-items-center rounded-3xl border border-emerald-900 bg-[#0e2115] text-emerald-400 sm:size-32">
              <FlaskConical className="size-10 sm:size-16" />
            </span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-emerald-500 sm:text-5xl">
              Artificial Life Lab
            </h1>
            <h2 className="mt-3 text-lg font-bold sm:text-2xl">
              Unlock emergence through immersive, interactive simulations.
            </h2>
            <p className="mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
              Explore Game of Life and Particle Life — captivating artificial-life toys.
              Dive into hands-on play and discover complex behavior from stupidly simple
              rules.
            </p>
          </div>
        </header>

        <main className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIMS.map((sim) => (
            <Link
              key={sim.id}
              to={sim.path}
              className="relative overflow-hidden rounded-lg border border-gray-800 bg-gray-900 p-6 shadow-lg transition-colors hover:bg-gray-800"
            >
              <div className="mb-2 flex items-center">
                <sim.icon size={26} className="mr-2 font-bold" style={{ color: sim.accent }} />
                <h3 className="text-lg font-semibold md:text-xl">{sim.title}</h3>
              </div>
              <p className="text-sm text-slate-300 md:text-base">{sim.tagline}</p>
              <p className="mt-2 flex gap-1.5 text-[13px] text-slate-400">
                <Eye size={14} className="mt-0.5 shrink-0" /> {sim.phenomenon}
              </p>
              {gpuReady && sim.gpu && (
                <p className="mt-3 flex items-center gap-1 font-mono text-[11px] text-yellow-300/90">
                  <Zap size={12} /> GPU-accelerated
                </p>
              )}
            </Link>
          ))}
        </main>
      </div>
    </>
  );
}
