#!/usr/bin/env node
// pnpm new-sim <kebab-id> [ComponentName]
// scaffolds src/sims/<kebab-id>/ + reminds you to wire the route
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [kebab, comp] = process.argv.slice(2);
if (!kebab) {
  console.log("usage: pnpm new-sim <kebab-id> [ComponentName]");
  console.log("  e.g. pnpm new-sim boids Boids");
  process.exit(1);
}
const name = comp ?? kebab.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join("");
const dir = join(root, "src/sims", kebab);
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, `${name}.tsx`),
  `import { useState } from "react";\nimport { FlaskConical, Pause, Play } from "lucide-react";\nimport { Collapse } from "../../components/Collapse.js";\nimport { SimShell } from "../../components/SimShell.js";\nimport { Slider } from "../../components/ui/Slider.js";\n\nexport function ${name}() {\n  const [running, setRunning] = useState(true);\n  const [speed, setSpeed] = useState(12);\n  return (\n    <SimShell\n      n="??"\n      title="${name}"\n      icon={<FlaskConical size={24} />}\n      accent="#4ade80"\n      stats={<span>Gen <b>0</b></span>}\n      dock={\n        <button type="button" title="Play or Pause" aria-label="Play or Pause"\n          className="pointer-events-auto grid size-14 place-items-center rounded-full bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80"\n          onClick={() => setRunning((r) => !r)}>\n          {running ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}\n        </button>\n      }\n      controls={\n        <Collapse label="World" opened>\n          <Slider label="Speed (gen/s)" value={speed} min={1} max={60} onChange={setSpeed} />\n        </Collapse>\n      }\n    >\n      <div className="absolute inset-0 grid place-items-center text-slate-400\">\n        canvas goes here — full viewport stage\n      </div>\n    </SimShell>\n  );\n}\n`
);
console.log(`created src/sims/${kebab}/${name}.tsx`);
console.log(`next: add <Route> in src/App.tsx + entry in src/sims.ts`);
