/* "Layered drift rings" -- two offset, overlapping stroked circles (not
   concentric), reading as a two-track skid/drift mark rather than a plain
   letterform. currentColor so it inherits correctly in both light and
   dark mode, same as the previous single-path version. */
export default function DriftMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <circle cx="13" cy="17" r="10" stroke="currentColor" strokeWidth="3" opacity="0.5" />
      <circle cx="19" cy="17" r="10" stroke="currentColor" strokeWidth="3.5" />
    </svg>
  );
}
