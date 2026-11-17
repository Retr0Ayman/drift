import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, vapidAuthHeader } from "./webpush";

describe("isAllowedPushEndpoint", () => {
  it("accepts real browser push services and rejects everything else", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://jmt17.google.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://www.google.com/search?q=x")).toBe(false);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });
});

describe("vapidAuthHeader", () => {
  it("produces an ES256 JWT that verifies against the public key", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const priv = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
    const raw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
    const pub = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const h = await vapidAuthHeader("https://fcm.googleapis.com/fcm/send/abc", priv, pub, "https://example.test");
    const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m[4]).toBe(pub);
    const claims = JSON.parse(atob(m[2].replace(/-/g, "+").replace(/_/g, "/")));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    const sigStr = atob(m[3].replace(/-/g, "+").replace(/_/g, "/") + "==");
    const sig = new Uint8Array(new ArrayBuffer(sigStr.length));
    for (let i = 0; i < sigStr.length; i++) sig[i] = sigStr.charCodeAt(i);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, sig, new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});
