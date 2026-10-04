import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.js";
import { NotFound } from "./pages/NotFound.js";
import { GameOfLife } from "./sims/game-of-life/GameOfLife.js";
import { ParticleLife } from "./sims/particle-life/ParticleLife.js";
import { CREATURES_URL } from "./sims.js";

/** Creatures moved to its own site; old links (including ?cfg= share codes) follow it there. */
function CreaturesMoved() {
  const { search } = useLocation();
  useEffect(() => {
    window.location.replace(`${CREATURES_URL}#/creatures${search}`);
  }, [search]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/game-of-life" element={<GameOfLife />} />
        <Route path="/particle-life" element={<ParticleLife />} />
        <Route path="/creatures" element={<CreaturesMoved />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}
