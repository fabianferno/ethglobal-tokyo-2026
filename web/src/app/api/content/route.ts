import { z } from "zod";
import { generateData } from "@/lib/content/server";
import { BUDGET_MESSAGE, BUSY_MESSAGE, globalPerHour, overBudget } from "@/lib/budget";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ prompt: z.string().trim().min(2).max(400), nonce: z.number().int().min(0).max(1_000_000).default(0) });

/** The starting data for one app: Gemini writes typed collections of records; zod validates them. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { prompt, nonce? }" }, { status: 400 });
  if (overBudget()) return Response.json({ error: BUDGET_MESSAGE }, { status: 503 });
  const rl = rateLimit(`content:${clientKey(request)}`, 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  if (!rateLimit("content:global", globalPerHour("CONTENT", 600), 3_600_000).ok) return Response.json({ error: BUSY_MESSAGE }, { status: 503 });
  try {
    return Response.json({ data: await generateData(parsed.data.prompt, parsed.data.nonce) });
  } catch (e) {
    console.warn(`[content] data: ${(e as Error).message}`);
    return Response.json({ error: "Couldn't write this one." }, { status: 502 });
  }
}
