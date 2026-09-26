import "server-only";
/**
 * Tiny in-memory fixed-window rate limiter for API routes that spend server gas/funds. Per-instance
 * only (fine for the hackathon; use a shared store like Upstash/Redis for real multi-instance deploys).
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Allow up to `limit` hits per `windowMs` for `key`. Returns whether this hit is allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfterMs: b.resetAt - now };
  b.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

/**
 * Best-effort client key from proxy headers. Prefers `x-real-ip` (set by the platform, e.g. Vercel),
 * then the LAST x-forwarded-for hop (added by the nearest trusted proxy — the first hop is
 * client-supplied and trivially spoofable). Falls back to a constant in local dev (no proxy headers),
 * so a single dev machine shares one bucket rather than being bypassable per-request.
 */
export function clientKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "local";
}

/** Convenience: build a 429 Response when a limit is hit. */
export function tooMany(retryAfterMs: number): Response {
  const s = Math.ceil(retryAfterMs / 1000);
  return Response.json({ error: `rate limited — retry in ${s}s` }, { status: 429, headers: { "retry-after": String(s) } });
}
