import type { ReactNode } from "react";
import Reveal from "../ui/Reveal";
import HeroHeadline from "../ui/HeroHeadline";
import { stagger } from "../../lib/motion";
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
  /* One quiet line of real catalogue context under the title (Home.tsx's
     catalogueMeta). Optional because every other page that renders a grid
     has no such figure to state. */
  meta?: ReactNode;
}

const SKELETON_COUNT = 8;

export default function GameGrid({ games, filters, initialLoading, meta }: GameGridProps) {
  return (
    <section className="catalogue wrap">
      <Reveal className="catalogue-head">
        <span className="catalogue-eyebrow">The catalogue</span>
        <HeroHeadline className="catalogue-title">Every title orlaz is tracking</HeroHeadline>
        {meta ? <p className="catalogue-meta">{meta}</p> : null}
      </Reveal>
      {filters}
      {games.length ? (
        <div className="catalogue-grid">
          {games.map((g, i) => (
            <Reveal key={g.id} as="div" delay={stagger(i)}>
              <GameCard game={g} priority={i === 0} />
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
