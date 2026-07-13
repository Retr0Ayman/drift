/* Grayscale isometric line-art accent -- three build "panels" drifting apart
   along dashed depth lines, echoing the crack-vs-current-build gap the whole
   product is about. Not literal, just matching the Linear/Apple register:
   monoline stroke, low-opacity, currentColor so it inherits --ink-3/--ink-4
   from context and works on any surface. */
export default function DriftGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g opacity="0.5">
        <path d="M60 210 L200 140 L340 210 L200 280 Z" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="60" cy="210" r="3" fill="currentColor" />
        <circle cx="200" cy="140" r="3" fill="currentColor" />
        <circle cx="340" cy="210" r="3" fill="currentColor" />
        <circle cx="200" cy="280" r="3" fill="currentColor" />
      </g>

      <g opacity="0.72">
        <path d="M170 150 L310 80 L450 150 L310 220 Z" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="170" cy="150" r="3.2" fill="currentColor" />
        <circle cx="310" cy="80" r="3.2" fill="currentColor" />
        <circle cx="450" cy="150" r="3.2" fill="currentColor" />
        <circle cx="310" cy="220" r="3.2" fill="currentColor" />
      </g>

      <g opacity="1">
        <path d="M230 260 L370 190 L510 260 L370 330 Z" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="230" cy="260" r="3.6" fill="currentColor" />
        <circle cx="370" cy="190" r="3.6" fill="currentColor" />
        <circle cx="510" cy="260" r="3.6" fill="currentColor" />
        <circle cx="370" cy="330" r="3.6" fill="currentColor" />
      </g>

      <g strokeDasharray="3 6" strokeWidth="1.2" stroke="currentColor" opacity="0.55">
        <path d="M200 140 L310 80" />
        <path d="M340 210 L450 150" />
        <path d="M200 280 L310 220" />
        <path d="M310 80 L370 190" />
        <path d="M450 150 L510 260" />
        <path d="M310 220 L370 330" />
      </g>
    </svg>
  );
}
