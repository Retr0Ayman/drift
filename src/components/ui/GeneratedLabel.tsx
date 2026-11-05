/* Honest, quiet provenance label for AI-written text -- plain secondary
   text, no icon, no glow. */
export default function GeneratedLabel({ text = "Generated summary" }: { text?: string }) {
  return <span className="generated-label">{text}</span>;
}
