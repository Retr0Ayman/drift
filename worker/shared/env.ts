export interface Env {
  XREL_CLIENT_ID?: string;
  XREL_CLIENT_SECRET?: string;
  // Set via the Cloudflare dashboard (Workers & Pages -> drift -> Settings ->
  // Variables and Secrets), never in code or chat. Powers FAQ generation and
  // the AI-assisted extras (group/publisher blurbs, search interpretation) --
  // every one of those routes checks for this and returns an honest
  // "unavailable" response if it's unset, rather than assuming it exists.
  GROQ_API_KEY?: string;
  // Static-assets binding, configured via `assets.binding` in wrangler.jsonc --
  // this is what makes `env.ASSETS.fetch(request)` serve the built Vite app.
  ASSETS: Fetcher;
}
