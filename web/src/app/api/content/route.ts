import { z } from "zod";
import { generateContent } from "@/lib/content/server";
import { SHAPE_KEYS, SHELL_KEYS, VIBES } from "@/lib/intent/types";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  prompt: z.string().trim().min(2).max(400),
  shell: z.enum(SHELL_KEYS).exclude(["unspecified"]),
  shape: z.enum(SHAPE_KEYS),
  vibe: z.enum(VIBES),
  nonce: z.number().int().min(0).max(1000).default(0),
});

/** Content for one app window: Gemini writes JSON for the shape Jev chose; zod validates it into a Bundle. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { prompt, shell, shape, vibe, nonce? }" }, { status: 400 });
  const rl = rateLimit(`content:${clientKey(request)}`, 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  try {
    return Response.json({ bundle: await generateContent(parsed.data) });
  } catch (e) {
    console.warn(`[content] ${parsed.data.shape}: ${(e as Error).message}`);
    return Response.json({ error: "Couldn't write this one." }, { status: 502 });
  }
}
