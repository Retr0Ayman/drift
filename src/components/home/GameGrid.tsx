import type { ReactNode } from "react";
import Reveal from "../ui/Reveal";
import GameCard from "./GameCard";
import type { Game } from "../../types/game";
import "./GameGrid.css";

interface GameGridProps {
  games: Game[];
  filters?: ReactNode;
  /* True only for the very first fetch (no games in hand yet at all) --
     NOT the same as "filtered down to zero", which is a real, correct
     empty state (see catalogue-empty below). Without this split, the
     grid showed "No titles match these filters" for a half-second on
     every cold load, which is simply false: nothing had loaded yet, no
     filter had excluded anything. */
  initialLoading?: boolean;
}

const SKELETON_COUNT = 8;

export default function GameGrid({ games, filters, initialLoading }: GameGridProps) {
  return (
    <section className="catalogue wrap">
      <Reveal className="catalogue-head">
        <span className="catalogue-eyebrow">The catalogue</span>
        <h2 className="catalogue-title">Every title orlaz is tracking</h2>
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
      ) : initialLoading ? (
        <div className="catalogue-grid" aria-hidden="true">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div className="game-card-skeleton" key={i} />
          ))}
        </div>
      ) : (
        <div className="catalogue-empty">No titles match these filters.</div>
      )}
    </section>
  );
}
