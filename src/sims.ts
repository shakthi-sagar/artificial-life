import { Atom, LayoutGrid, type LucideIcon } from "lucide-react";

export type Sim = {
  id: string;
  n: string;
  title: string;
  tagline: string;
  phenomenon: string;
  path: string;
  accent: string;
  icon: LucideIcon;
  /** has a WebGPU engine (shows the GPU badge on the hub) */
  gpu?: boolean;
};

/** Creatures started here as the third sim and now lives on its own site. */
export const CREATURES_URL = "https://creatures.shadster.dev/";

export const SIMS: Sim[] = [
  {
    id: "game-of-life",
    n: "01",
    title: "Game of Life",
    tagline: "Four rules. Infinite machines.",
    phenomenon: "Gliders, guns, still lifes from B3/S23",
    path: "/game-of-life",
    accent: "#4ade80",
    icon: LayoutGrid,
    gpu: true,
  },
  {
    id: "particle-life",
    n: "02",
    title: "Particle Life",
    tagline: "Chemistry without chemistry.",
    phenomenon: "Cells, snakes & mitosis from an attraction matrix",
    path: "/particle-life",
    accent: "#f472b6",
    icon: Atom,
    gpu: true,
  },
];
