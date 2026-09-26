import { markets } from "@/lib/defi/server";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import { chainList, symbolParam } from "../params";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Where a token trades best right now, DEX and CEX: GET /api/defi/markets?token=ETH */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = symbolParam(url, "token", "ETH");
  if (!token) return Response.json({ error: "expected a token symbol like ETH" }, { status: 400 });
  const rl = rateLimit(`defi:${clientKey(request)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  try {
    return Response.json(await markets(token, chainList(url)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
