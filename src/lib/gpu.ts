import { useEffect, useState } from "react";

// ---- capability detection ----------------------------------------------------

export type GpuState = "checking" | "yes" | "no";
let cached: GpuState | null = null;
let pending: Promise<GpuState> | null = null;

/** Firefox/Safari expose no WebGPU at all, and some builds expose `navigator.gpu` without the
 *  bitflag globals — probe everything the engines touch so we fall back to CPU cleanly. */
export function webgpuGlobalsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    typeof GPUBufferUsage !== "undefined" &&
    typeof GPUMapMode !== "undefined" &&
    typeof GPUShaderStage !== "undefined"
  );
}

export function detectWebGPU(): Promise<GpuState> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      try {
        if (!webgpuGlobalsAvailable() || !navigator.gpu) {
          cached = "no";
          return cached;
        }
        const adapter = await navigator.gpu.requestAdapter();
        cached = adapter ? "yes" : "no";
      } catch {
        cached = "no";
      }
      return cached;
    })();
  }
  return pending;
}

export function useWebGPU(): GpuState {
  const [s, setS] = useState<GpuState>(cached ?? "checking");
  useEffect(() => {
    let alive = true;
    detectWebGPU().then((v) => {
      if (alive) setS(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

// ---- global setting (persisted, observable) ----------------------------------

const KEY = "alife.gpu";
const listeners = new Set<() => void>();
let enabledCache: boolean | null = null;

function readSetting(): boolean {
  if (enabledCache !== null) return enabledCache;
  try {
    const raw = localStorage.getItem(KEY);
    enabledCache = raw === null ? true : raw === "on";
  } catch {
    enabledCache = true;
  }
  return enabledCache;
}

export function getGpuEnabled(): boolean {
  return readSetting();
}

export function setGpuEnabled(v: boolean) {
  enabledCache = v;
  try {
    localStorage.setItem(KEY, v ? "on" : "off");
  } catch {
    /* private mode etc. */
  }
  listeners.forEach((l) => l());
}

export function useGpuEnabled(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(readSetting);
  useEffect(() => {
    const fn = () => setV(readSetting());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [v, setGpuEnabled];
}
