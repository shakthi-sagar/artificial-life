import { Info } from "lucide-react";

/** TooltipInfo clone (simplified): info glyph with native tooltip. */
export function Tip({ text }: { text: string }) {
  return (
    <span title={text} className="ml-1 inline-flex cursor-help align-top text-zinc-400 hover:text-zinc-200">
      <Info size={15} />
    </span>
  );
}
