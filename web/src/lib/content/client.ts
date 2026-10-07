import type { AppManifest } from "@/lib/compose/compose";
import type { Bundle } from "@/lib/compose/shapes";

const cache = new Map<string, Promise<Bundle>>();

/** One /api/content call per (app content identity, nonce). Re-opening the same prompt reuses it. */
export function fetchContent(app: AppManifest, nonce: number, f: typeof fetch = fetch): Promise<Bundle> {
  const key = [app.prompt.trim().toLowerCase(), app.shell, app.shape, app.vibe, nonce].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    let res: Response;
    try {
      res = await f("/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: app.prompt, shell: app.shell, shape: app.shape, vibe: app.vibe, nonce }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new Error("Gemini took too long. Try again.");
    }
    const j = (await res.json().catch(() => ({}))) as { bundle?: Bundle; error?: string };
    if (res.ok && j.bundle) return j.bundle;
    // People see this sentence in the window, so never show them a raw API message.
    if (res.status === 429) throw new Error("Too many apps at once. Wait a few seconds and try again.");
    if (res.status === 400) throw new Error("That prompt can't be turned into an app.");
    throw new Error("Couldn't write this one.");
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
