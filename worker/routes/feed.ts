import type { Handler } from "../shared/types";
import { collectCandidates, isAlertable } from "../scheduled";
import { methodForGroup } from "../shared/constants";

const BASE_URL = "https://drift.aymanestifanos9.workers.dev";
const SITE_TITLE = "orlaz — new cracks";
const SITE_DESC = "New PC game crack releases, live from xREL.";

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Same live-data source and "what counts as a real release" filter as the
   Discord alerter -- reuses collectCandidates/isAlertable from
   scheduled.ts rather than re-implementing that logic a third time. Gets
   meaningfully more complete once the Phase 3 database exists (full
   history instead of whatever's in this one live pull). */
export const handleFeed: Handler = async ({ env }) => {
  const releases = (await collectCandidates(env)).filter(isAlertable);
  releases.sort((a, b) => (b.time || 0) - (a.time || 0));

  const items = releases.slice(0, 50).map((rel) => {
    const title = rel.ext_info?.title || rel.dirname;
    const group = rel.group_name || "unknown";
    const method = methodForGroup(group);
    const link = (rel.link_href as string | undefined) || BASE_URL;
    const pubDate = rel.time ? new Date(rel.time * 1000).toUTCString() : new Date().toUTCString();
    const desc = `${method === "hv" ? "Hypervisor" : "Traditional"} crack by ${group}`;
    return (
      `  <item>\n` +
      `    <title>${escapeXml(title)}</title>\n` +
      `    <link>${escapeXml(link)}</link>\n` +
      `    <guid isPermaLink="false">${escapeXml(rel.id)}</guid>\n` +
      `    <pubDate>${pubDate}</pubDate>\n` +
      `    <description>${escapeXml(desc)}</description>\n` +
      `  </item>`
    );
  });

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n<channel>\n` +
    `  <title>${escapeXml(SITE_TITLE)}</title>\n` +
    `  <link>${BASE_URL}</link>\n` +
    `  <description>${escapeXml(SITE_DESC)}</description>\n` +
    items.join("\n") +
    `\n</channel>\n</rss>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=900" },
  });
};
