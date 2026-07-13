import { useState, type ReactNode } from "react";
import GlassPanel from "../ui/GlassPanel";
import "./Carousel.css";

export default function Carousel({ slides }: { slides: ReactNode[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);

  return (
    <GlassPanel className="carousel" strong>
      <div className="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((s, i) => (
          <div className="carousel-slide" key={i}>
            {s}
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button className="carousel-nav carousel-nav--prev" onClick={() => go(index - 1)} aria-label="Previous slide">
            ‹
          </button>
          <button className="carousel-nav carousel-nav--next" onClick={() => go(index + 1)} aria-label="Next slide">
            ›
          </button>
          <div className="carousel-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                className={`carousel-dot${i === index ? " carousel-dot--on" : ""}`}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </GlassPanel>
  );
}
