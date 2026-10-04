import { Download, ImageOff, Link, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { codeFromInput, forgetMine, loadMine, rememberMine, shareUrl, type Mine, type SimId } from "../lib/share.js";

type Props = {
  sim: SimId;
  /** snapshot the sim's current config as a code */
  getCode: () => string | Promise<string>;
  /** current code, when cheap to know (highlights the matching card) */
  activeCode?: string;
  /** apply a code; throw if it isn't one of this sim's */
  onLoad: (code: string) => void | Promise<void>;
  /** called with the code whenever the user saves or copies a link */
  onShare?: (code: string) => void;
  /** optional preview image for a code */
  thumb?: (code: string) => string | null | Promise<string | null>;
};

const btn =
  "flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-[13px] text-slate-200 transition-colors hover:border-[var(--accent)] disabled:opacity-40";
const field =
  "min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-[13px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-[var(--accent)]";

function Thumb({ code, thumb }: { code: string; thumb?: Props["thumb"] }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (thumb) Promise.resolve(thumb(code)).then((s) => live && setSrc(s)).catch(() => {});
    return () => {
      live = false;
    };
  }, [code, thumb]);
  return src ? (
    <img src={src} alt="" className="h-[52px] w-[72px] object-contain [image-rendering:pixelated]" draggable={false} />
  ) : (
    <div className="grid h-[52px] w-[72px] place-items-center text-slate-600">
      <ImageOff size={16} />
    </div>
  );
}

/**
 * Save / share / load panel shared by every sim. Everything lives in the
 * link itself (#/<sim>?cfg=<code>); "Mine" is a list kept in this browser.
 */
export function SavePanel({ sim, getCode, activeCode, onLoad, onShare, thumb }: Props) {
  const [mine, setMine] = useState<Mine[]>(() => loadMine(sim));
  const [name, setName] = useState("");
  const [paste, setPaste] = useState("");
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  const copyLink = async (code: string) => {
    const url = shareUrl(sim, code);
    await navigator.clipboard?.writeText(url).catch(() => {});
    onShare?.(code);
    return url;
  };

  const save = async () => {
    const code = await getCode();
    setMine(rememberMine(sim, { code, name: name.trim() || "Untitled", savedAt: Date.now() }));
    const url = await copyLink(code);
    setStatus({ text: `Saved · link copied (${url.length.toLocaleString()} chars)`, tone: "ok" });
    setName("");
  };

  const share = async () => {
    const url = await copyLink(await getCode());
    setStatus({ text: `Link copied (${url.length.toLocaleString()} chars)`, tone: "ok" });
  };

  const load = async (code: string, label: string) => {
    try {
      await onLoad(code);
      setStatus({ text: `Loaded “${label}”`, tone: "ok" });
    } catch (e) {
      setStatus({ text: `Couldn't load: ${(e as Error).message}`, tone: "err" });
    }
  };

  const loadPasted = async () => {
    const code = codeFromInput(paste);
    if (!code) return;
    await load(code, "pasted link");
    setPaste("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <input
          className={field}
          placeholder="Name it"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label="Save name"
        />
        <button type="button" className={btn} onClick={save} title="Save to this browser and copy a share link">
          <Save size={14} /> Save
        </button>
        <button type="button" className={btn} onClick={share} title="Copy a share link" aria-label="Copy share link">
          <Link size={14} />
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          className={field}
          placeholder="Paste a link or code"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadPasted()}
          aria-label="Paste link or code"
        />
        <button type="button" className={btn} disabled={!paste.trim()} onClick={loadPasted}>
          <Download size={14} /> Load
        </button>
      </div>
      {status && (
        <p className={`!my-0 text-xs ${status.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{status.text}</p>
      )}

      <p className="!mt-1 !mb-0 text-xs text-slate-400">Saved in this browser ({mine.length})</p>
      {mine.length === 0 ? (
        <p className="!my-0 text-xs text-slate-500">Nothing saved yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {mine.map((m) => (
            <div
              key={m.code}
              className={`group relative flex cursor-pointer flex-col items-center rounded-lg border bg-slate-900/60 p-1 transition-colors ${
                activeCode === m.code ? "border-[var(--accent)]" : "border-slate-700/80 hover:border-slate-500"
              }`}
              onClick={() => load(m.code, m.name)}
              title={m.name}
            >
              <Thumb code={m.code} thumb={thumb} />
              <span className="w-full truncate text-center text-[11px] text-slate-300">{m.name}</span>
              <button
                type="button"
                aria-label={`Delete ${m.name}`}
                className="absolute top-0.5 right-0.5 hidden rounded bg-slate-900/90 p-0.5 text-slate-400 hover:text-rose-300 group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  setMine(forgetMine(sim, m.code));
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
