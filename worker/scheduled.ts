import type { Env } from "./shared/env";
import { handleXrelBrowse } from "./routes/xrel/browse";
import { handleXrelGroup } from "./routes/xrel/group";
import type { RawXrelRelease } from "./shared/xrel";
import { STARRED_GROUPS, methodForGroup, isRepackGroup, isAnonymousUpload, isWindowsRelease } from "./shared/constants";

interface ListResponse {
  list?: RawXrelRelease[];
}

const SEEDED_MARKER_KEY = "__seeded__";

/* Pulls the same two sources the frontend's catalog relies on: page 1 of the
   main Windows browse feed, plus each starred P2P group's full history via
   the existing xrel/group.ts lookup (P2P groups never show up in /browse at
   all -- see that file's own comment for why). Calls the route handlers
   directly with a synthetic same-origin Request rather than a real
   self-fetch back into this Worker -- identical logic and xREL-side
   caching, no extra network hop. */
async function collectCandidates(env: Env): Promise<RawXrelRelease[]> {
  const seen = new Map<string, RawXrelRelease>();

  const browseRes = await handleXrelBrowse({
    request: new Request("https://internal.invalid/api/xrel/browse?page=1&per_page=100"),
    env,
  });
  if (browseRes.ok) {
    const data = (await browseRes.json()) as ListResponse;
    for (const rel of data.list || []) seen.set(rel.id, rel);
  }

  for (const name of STARRED_GROUPS) {
    const groupRes = await handleXrelGroup({
      request: new Request(`https://internal.invalid/api/xrel/group?name=${encodeURIComponent(name)}`),
      env,
    });
    if (!groupRes.ok) continue;
    const data = (await groupRes.json()) as ListResponse;
    for (const rel of data.list || []) seen.set(rel.id, rel);
  }

  return [...seen.values()];
}

/* Same "is this actually a real Windows game crack" bar the frontend applies
   in src/lib/catalog.ts's parseReleaseRows -- without it, a TV/movie entry
   sharing xREL's API, a non-Windows platform release, or a repack/anonymous
   reupload could trigger an alert that misrepresents what actually
   happened (a repack didn't crack anything; crediting one here would be the
   same mislabel isRepackGroup/isAnonymousUpload guard against everywhere
   else in this app). */
function isAlertable(rel: RawXrelRelease): boolean {
  const ext = rel.ext_info || {};
  if (ext.type && ext.type !== "master_game") return false;
  if (!ext.title) return false;
  if (!isWindowsRelease(rel.dirname || "")) return false;
  const group = rel.group_name || "";
  if (isRepackGroup(group) || isAnonymousUpload(group)) return false;
  return true;
}

async function postDiscordAlert(webhookUrl: string, rels: RawXrelRelease[]): Promise<void> {
  const embeds = rels.map((rel) => {
    const group = rel.group_name || "unknown";
    const method = methodForGroup(group);
    return {
      title: rel.ext_info?.title || rel.dirname,
      description: `${method === "hv" ? "Hypervisor" : "Traditional"} crack by **${group}**`,
      url: rel.link_href || undefined,
      color: method === "hv" ? 0xb072f5 : 0x2de2d1,
    };
  });

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: rels.length === 1 ? "New crack tracked:" : `${rels.length} new cracks tracked:`,
      embeds,
    }),
  });
}

/* Cron-triggered (see wrangler.jsonc's `triggers.crons`): diffs newly-seen
   release IDs against the SEEN_RELEASES KV namespace and posts a Discord
   embed for anything genuinely new. First-ever run seeds SEEN_RELEASES with
   everything currently visible *without* alerting on any of it -- otherwise
   the first cron tick after this ships would post one alert per release
   already sitting in the catalog, which isn't "new" by any reasonable
   reading of the feature. Both env bindings are optional at the type level
   for exactly this reason: a deploy can land before the KV namespace is
   created and the webhook secret is set (both require manual, non-scriptable
   Cloudflare/Discord dashboard steps -- see DEPLOY.md), and this should
   silently no-op until then rather than error every 15 minutes. */
export async function runScheduledAlert(env: Env): Promise<void> {
  if (!env.DISCORD_WEBHOOK_URL || !env.SEEN_RELEASES) return;

  const releases = (await collectCandidates(env)).filter(isAlertable);

  const alreadySeeded = await env.SEEN_RELEASES.get(SEEDED_MARKER_KEY);
  if (!alreadySeeded) {
    await Promise.all(releases.map((rel) => env.SEEN_RELEASES.put(`rel:${rel.id}`, "1")));
    await env.SEEN_RELEASES.put(SEEDED_MARKER_KEY, "1");
    return;
  }

  const newReleases: RawXrelRelease[] = [];
  for (const rel of releases) {
    const already = await env.SEEN_RELEASES.get(`rel:${rel.id}`);
    if (!already) newReleases.push(rel);
  }
  if (!newReleases.length) return;

  await Promise.all(newReleases.map((rel) => env.SEEN_RELEASES.put(`rel:${rel.id}`, "1")));

  // Discord caps embeds at 10 per message -- chunk rather than truncate so
  // an unusually busy 15-minute window still alerts on everything found.
  for (let i = 0; i < newReleases.length; i += 10) {
    await postDiscordAlert(env.DISCORD_WEBHOOK_URL, newReleases.slice(i, i + 10));
  }
}
