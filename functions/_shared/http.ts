/* Frontend + functions share one origin on Cloudflare Pages, so CORS isn't load
   bearing in production -- kept only so local dev (Vite on one port, wrangler
   pages dev proxying on another) still works without extra config. */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(obj: unknown, maxage: number, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxage}` },
  });
}

export function relay(r: Response, maxage = 900): Response {
  return new Response(r.body, {
    status: r.status,
    headers: {
      ...CORS,
      "Content-Type": r.headers.get("Content-Type") || "application/json",
      "Cache-Control": `public, max-age=${maxage}`,
    },
  });
}

export const enc = (s: string | null | undefined): string => encodeURIComponent(s || "");
