import { useEffect } from "react";

// Injects one JSON-LD <script type="application/ld+json"> into <head> for
// as long as the calling component is mounted with a non-null payload,
// removing it on unmount/change -- same "one hook, one head side effect"
// shape as usePageMeta. Pass null while the underlying data isn't resolved
// yet (e.g. GameDetail before the catalog has the title) rather than a
// schema built from placeholder values; a page with no structured data is
// honest, a fabricated one isn't.
export function usePageStructuredData(data: Record<string, unknown> | null) {
  const serialized = data ? JSON.stringify(data) : null;

  useEffect(() => {
    if (!serialized) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.textContent = serialized;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [serialized]);
}
