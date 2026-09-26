import { yields } from "@/lib/defi/server";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import { chainList, projectList, symbolParam } from "../params";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Live lending/LP yields across chains: GET /api/defi/yields?token=USDC&chains=Base,Sui&projects=aave */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = symbolParam(url, "token", "USDC");
  if (!token) return Response.json({ error: "expected a token symbol like USDC" }, { status: 400 });
  const rl = rateLimit(`defi:${clientKey(request)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  try {
    return Response.json(await yields(token, chainList(url), projectList(url)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
