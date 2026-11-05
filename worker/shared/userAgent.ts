/* Identifies orlaz on every outbound request, per MediaWiki's API etiquette
   (and plain good manners to Steam/xREL/steamcmd): a descriptive tool name
   plus a contact URL -- the public repo, not a personal address. */
export const USER_AGENT = "orlaz/1.0 (+https://github.com/Retr0Ayman/drift)";

/* Returns `init` with a User-Agent header added unless the caller already
   set one. Never overrides an explicit value. */
export function withUserAgent(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
  return { ...init, headers };
}
