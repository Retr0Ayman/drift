import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { buildId } from "../shared/steam";

export const handleBuild: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const appid = url.searchParams.get("appid");
  if (!/^\d+$/.test(appid || "")) return json({ error: "pass ?appid=" }, 60, 400);
  return json({ appid: Number(appid), buildid: await buildId(appid as string) }, 3600);
};
