/* Web Push opt-in. Nothing here runs until the user clicks "Notify me":
   no permission prompt on load, no service worker registered before that.
   Stored server-side: the push endpoint + watched game ids, nothing else. */
const FLAG = "drift.push.on";

export const pushSupported = (): boolean =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function pushEnabledFlag(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}
function setFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    /* private mode: toggle still works for this session's server state */
  }
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
export const onPushChange = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const toKey = (b64: string): Uint8Array<ArrayBuffer> => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/* Must be called from a click handler (permission prompt). */
export async function enablePush(gameIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "This browser doesn't support notifications." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: perm === "denied" ? "Notifications are blocked for this site in your browser settings." : "Permission wasn't granted." };
  try {
    const keyRes = await fetch("/api/push/key");
    if (!keyRes.ok) return { ok: false, error: "Notifications aren't available right now." };
    const { key } = (await keyRes.json()) as { key: string };
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, gameIds }),
    });
    if (!res.ok) return { ok: false, error: "Couldn't save your notification settings." };
    setFlag(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't turn notifications on." };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    /* fall through: the flag is cleared regardless */
  }
  setFlag(false);
}

let t: ReturnType<typeof setTimeout> | null = null;
/* Keeps the server's watched-game set in step with the local watchlist. */
export function syncPushWatch(gameIds: string[]): void {
  if (!pushSupported() || !pushEnabledFlag()) return;
  if (t) clearTimeout(t);
  t = setTimeout(async () => {
    try {
      const sub = await currentSubscription();
      if (!sub) return;
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, gameIds }),
      });
    } catch {
      /* best effort */
    }
  }, 800);
}
