export interface Env {
  XREL_CLIENT_ID?: string;
  XREL_CLIENT_SECRET?: string;
  // Static-assets binding, configured via `assets.binding` in wrangler.jsonc --
  // this is what makes `env.ASSETS.fetch(request)` serve the built Vite app.
  ASSETS: Fetcher;
}
