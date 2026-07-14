import { useEffect } from "react";

interface PageMeta {
  title: string;
  description?: string;
  image?: string;
}

const SITE_NAME = "orlaz";
const DEFAULT_DESCRIPTION =
  "Live crack, build and version status for PC games — hypervisor and traditional cracks side by side, flagged the moment either falls behind the latest patch.";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Sets document.title + description/OG meta per route. No dependency needed
// (react-helmet-async isn't installed) -- this is the whole surface area a
// single-page-per-mount SPA needs.
export function usePageMeta({ title, description, image }: PageMeta) {
  useEffect(() => {
    const fullTitle = `${title} · ${SITE_NAME}`;
    const desc = description || DEFAULT_DESCRIPTION;
    document.title = fullTitle;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
    if (image) setMeta("property", "og:image", image);
  }, [title, description, image]);
}
