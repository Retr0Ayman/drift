import type { Env } from "../_shared/env";
import { json } from "../_shared/http";
import { buildId } from "../_shared/steam";

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const appid = url.searchParams.get("appid");
  if (!/^\d+$/.test(appid || "")) return json({ error: "pass ?appid=" }, 60, 400);
  return json({ appid: Number(appid), buildid: await buildId(appid as string) }, 3600);
};
