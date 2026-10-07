import { z } from "zod";
import { APIUserAbortError, classifyWithJev, jevMode } from "@/lib/intent/client";
import { mockClassify } from "@/lib/intent/mock";
import { type IntentResult, noneResult } from "@/lib/intent/types";

export const runtime = "nodejs";

const bodySchema = z.object({ text: z.string().max(400) });

const cache = new Map<string, IntentResult>();
const CACHE_MAX = 500;

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Expected { text }" }, { status: 400 });

  const { text } = body.data;
  const key = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (text.trim().length < 2) return Response.json(noneResult());

  const hit = cache.get(key);
  // Keep the time Jev took for this answer; `cached` says it came from here.
  if (hit) return Response.json({ ...hit, cached: true } satisfies IntentResult);

  if (jevMode() === "offline") return Response.json(mockClassify(text));

  try {
    const result = await classifyWithJev(text, request.signal);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return Response.json(result);
  } catch (err) {
    if (err instanceof APIUserAbortError || request.signal.aborted) return new Response(null, { status: 499 });
    console.warn(`[jev] call failed: ${err instanceof Error ? err.message : String(err)}`);
    // Never flash an error in the Start menu: fall back to the offline classifier for this keystroke.
    return Response.json({ ...mockClassify(text), error: true });
  }
}
