import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Save & share for every sim, with no server: a sim turns its config into a
 * *code* (a short prefixed string, e.g. "c2.…" or "l1.…") that travels in
 * the URL hash as #/<sim>?cfg=<code>. A per-browser "mine" list lives in
 * localStorage.
 */

export type SimId = "game-of-life" | "particle-life";
export type Mine = { name: string; savedAt: number; code: string };

// ---- codes: "<prefix>." + base64url(deflate-raw(JSON)) ----

const b64u = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function packCode(prefix: string, data: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(data));
  return `${prefix}.${b64u(await pipe(raw, new CompressionStream("deflate-raw")))}`;
}

export async function unpackCode<T>(prefix: string, code: string): Promise<T | null> {
  if (!code.startsWith(`${prefix}.`)) return null;
  try {
    const raw = await pipe(unb64u(code.slice(prefix.length + 1)), new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  } catch {
    return null;
  }
}

export const shareUrl = (sim: SimId, code: string) =>
  `${location.origin}${location.pathname}#/${sim}?${new URLSearchParams({ cfg: code })}`;

/** Accepts a pasted share link or a bare code and returns the code. */
export function codeFromInput(text: string): string {
  const t = text.trim();
  const m = t.match(/[?&]cfg=([^&#\s]+)/);
  return m ? decodeURIComponent(m[1]) : t;
}

// ---- local "mine" list ----

const KEY = (sim: SimId) => `alife.saves.${sim}`;
const MAX_LOCAL = 40;

export function loadMine(sim: SimId): Mine[] {
  try {
    const arr: unknown = JSON.parse(localStorage.getItem(KEY(sim)) ?? "[]");
    return Array.isArray(arr) ? arr.filter((m): m is Mine => typeof m?.code === "string") : [];
  } catch {
    return [];
  }
}

function writeMine(sim: SimId, list: Mine[]) {
  try {
    localStorage.setItem(KEY(sim), JSON.stringify(list.slice(0, MAX_LOCAL)));
  } catch {
    // storage full or blocked: the in-memory list still works this session
  }
}

/** Upsert by code, newest first. */
export function rememberMine(sim: SimId, entry: Mine): Mine[] {
  const list = [entry, ...loadMine(sim).filter((m) => m.code !== entry.code)];
  writeMine(sim, list);
  return list;
}

export function forgetMine(sim: SimId, code: string): Mine[] {
  const list = loadMine(sim).filter((m) => m.code !== code);
  writeMine(sim, list);
  return list;
}

// ---- URL ----

/**
 * Applies ?cfg=<code> when it appears (first load or a pasted link) and
 * returns a setter for writing the link back without re-triggering the load.
 */
export function useShareLink(apply: (code: string) => void | Promise<void>) {
  const [params, setParams] = useSearchParams();
  const cfg = params.get("cfg");
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const last = useRef<string | null>(null);
  /** a load is in flight: hold off writes so the link isn't clobbered mid-load */
  const pending = useRef(false);
  const run = useRef(0);

  useEffect(() => {
    if (!cfg || cfg === last.current) return;
    last.current = cfg;
    const mine = ++run.current;
    pending.current = true;
    Promise.resolve()
      .then(() => applyRef.current(cfg))
      .catch(() => {})
      .finally(() => {
        if (run.current === mine) pending.current = false;
      });
  }, [cfg]);

  return useCallback(
    (code: string | null) => {
      if (pending.current) return;
      last.current = code;
      setParams(code ? { cfg: code } : {}, { replace: true });
    },
    [setParams],
  );
}
