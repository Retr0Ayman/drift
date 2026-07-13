import type { ReactNode } from "react";
import Reveal from "../ui/Reveal";
import GameCard from "./GameCard";
import type { Game } from "../../types/game";
import "./GameGrid.css";

interface GameGridProps {
  games: Game[];
  filters?: ReactNode;
}

export default function GameGrid({ games, filters }: GameGridProps) {
  return (
    <section className="catalogue wrap">
      <Reveal className="catalogue-head">
        <span className="catalogue-eyebrow">The catalogue</span>
        <h2 className="catalogue-title">Every title DRIFT is tracking</h2>
      </Reveal>
      {filters}
      {games.length ? (
        <div className="catalogue-grid">
          {games.map((g, i) => (
            <Reveal key={g.id} as="div" delay={Math.min(i, 8) * 0.045}>
              <GameCard game={g} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="catalogue-empty">No titles match these filters.</div>
      )}
    </section>
  );
}
