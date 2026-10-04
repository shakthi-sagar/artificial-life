import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-400">
        <ArrowLeft size={15} /> lab
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold">Unknown sim</h1>
      <p className="mt-2 text-slate-400">That petri dish doesn't exist yet.</p>
    </div>
  );
}
