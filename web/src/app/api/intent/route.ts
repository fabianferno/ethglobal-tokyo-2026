import { z } from "zod";
import { APIUserAbortError, classifyWithJev, jevMode } from "@/lib/intent/client";
import { mockClassify } from "@/lib/intent/mock";
import { type IntentResult, noneResult } from "@/lib/intent/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  text: z.string().max(400),
  candidates: z.array(z.object({ id: z.string().max(120), description: z.string().max(240) })).max(12).default([]),
});

const cache = new Map<string, IntentResult>();
const CACHE_MAX = 500;

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Expected { text, candidates? }" }, { status: 400 });

  const { text, candidates } = body.data;
  const key = `${text.toLowerCase().replace(/\s+/g, " ").trim()}|${candidates.map((c) => c.id).join(",")}`;
  if (text.trim().length < 2) return Response.json(noneResult());

  const hit = cache.get(key);
  if (hit) return Response.json({ ...hit, latencyMs: 0, cached: true } satisfies IntentResult);

  if (jevMode() === "offline") return Response.json(mockClassify(text, candidates));

  try {
    const result = await classifyWithJev(text, candidates, request.signal);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return Response.json(result);
  } catch (err) {
    if (err instanceof APIUserAbortError || request.signal.aborted) return new Response(null, { status: 499 });
    console.warn(`[jev] call failed: ${err instanceof Error ? err.message : String(err)}`);
    // Never flash an error in the Start menu: fall back to the offline classifier for this keystroke.
    return Response.json({ ...mockClassify(text, candidates), error: true });
  }
}
