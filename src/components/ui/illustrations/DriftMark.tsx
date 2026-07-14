/* Stylized "O" letterform -- an offset inner hole gives the ring a
   calligraphic thick/thin stroke instead of a generic uniform circle. */
export default function DriftMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M21.5 12A9.5 9.5 0 1 1 2.5 12a9.5 9.5 0 0 1 19 0ZM19.6 11.2a6.8 6.8 0 1 1-13.6 0 6.8 6.8 0 0 1 13.6 0Z"
        fill="currentColor"
      />
    </svg>
  );
}
