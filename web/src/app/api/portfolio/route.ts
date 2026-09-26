import { z } from "zod";
import { realPortfolio } from "@/lib/portfolio/server";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const target = z.union([z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/), z.string().regex(/^0x[0-9a-fA-F]{40}$/)]);

/** Real read-only portfolio of any mainnet ENS name / address: balances, prices, 7d/30d change. */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim().toLowerCase() ?? "";
  if (!target.safeParse(name).success) return Response.json({ error: "expected an ENS name or 0x address" }, { status: 400 });
  // suica.eth names live on Sepolia and are apps/folders, not people.
  if (name.endsWith(".suica.eth")) return Response.json({ error: "suica.eth names are apps, not wallets" }, { status: 400 });
  const rl = rateLimit(`portfolio:${clientKey(request)}`, 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  try {
    return Response.json(await realPortfolio(name));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
