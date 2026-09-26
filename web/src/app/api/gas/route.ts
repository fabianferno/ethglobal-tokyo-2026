import { gasReport } from "@/lib/portfolio/gas";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Live gas on Ethereum + Sui, priced in USD: GET /api/gas */
export async function GET(request: Request) {
  const rl = rateLimit(`gas:${clientKey(request)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  try {
    return Response.json(await gasReport());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
