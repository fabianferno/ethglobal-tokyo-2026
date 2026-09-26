import { priceHistory } from "@/lib/portfolio/prices";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Real daily closes for a token: GET /api/prices?symbol=ETH&days=30 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  // CoinGecko's public API serves at most 365 days; under 7 days it returns hourly (or 5-minute) points.
  const days = Math.min(365, Math.max(1, Math.ceil(Number(url.searchParams.get("days") ?? 30) || 30)));
  if (!/^[A-Z0-9]{2,12}$/.test(symbol)) return Response.json({ error: "expected a token symbol like ETH" }, { status: 400 });
  const rl = rateLimit(`prices:${clientKey(request)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  try {
    return Response.json(await priceHistory(symbol, days));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
