import { pools } from "@/lib/defi/server";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import { chainList, symbolParam } from "../params";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Live DEX pools for a pair across chains: GET /api/defi/pools?a=ETH&b=USDC&chains=Base */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const a = symbolParam(url, "a", "ETH");
  const b = symbolParam(url, "b", "USDC");
  if (!a || !b || a === b) return Response.json({ error: "expected two token symbols like a=ETH&b=USDC" }, { status: 400 });
  const rl = rateLimit(`defi:${clientKey(request)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  try {
    return Response.json(await pools(a, b, chainList(url)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
