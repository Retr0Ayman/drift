import { spendSubrequest } from "./subrequestBudget";

/* Payload-free Web Push ("tickle"): the push service delivers an empty push,
   the service worker then asks our own API what happened. That avoids the
   RFC 8291 payload-encryption layer entirely and means the push service
   never sees anything but "something happened". Auth is VAPID (RFC 8292):
   an ES256 JWT signed with a P-256 key held as a Worker secret. */

// Only real browser push services -- the endpoint comes from an unauthenticated
// client, so never POST to an arbitrary host.
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || endpoint.length >= 1000) return false;
    // Chromium also hands out legacy FCM endpoints like https://jmt17.google.com/fcm/send/...
    if (/(^|\.)google\.com$/.test(u.hostname)) return u.pathname.startsWith("/fcm/");
    return PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlStr = (s: string): string => b64url(new TextEncoder().encode(s));

export async function vapidAuthHeader(endpoint: string, privateJwk: string, publicKey: string, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlStr(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64urlStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(privateJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${publicKey}`;
}

export type PushResult = "sent" | "gone" | "retry";

/* One empty push. 201/200/202 = accepted; 404/410 = subscription is dead and
   should be dropped; anything else (429/5xx/network) = try again later. */
export async function sendTickle(endpoint: string, privateJwk: string, publicKey: string): Promise<PushResult> {
  spendSubrequest();
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthHeader(endpoint, privateJwk, publicKey, "https://drift.orlaz.workers.dev"),
        TTL: "86400",
        Urgency: "normal",
        "Content-Length": "0",
      },
    });
    if (r.status === 404 || r.status === 410) return "gone";
    return r.ok ? "sent" : "retry";
  } catch {
    return "retry";
  }
}
