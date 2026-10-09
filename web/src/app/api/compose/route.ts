import { z } from "zod";
import { fallbackTree } from "@/lib/compose/fallback";
import { composeStep } from "@/lib/compose/step";
import { decide, decisionsMode } from "@/lib/decisions/client";
import { emptyTree } from "@/lib/kit/tree";
import { CONTAINERS, PARTS, type AppState, type Tree } from "@/lib/kit/types";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const value = z.union([z.string().max(200), z.number(), z.boolean()]);
const field = z.object({ name: z.string().max(30), type: z.enum(["text", "number", "date", "yesno", "choice"]), values: z.array(z.string().max(30)).max(8).optional() });
const collection = z.object({ name: z.string().max(40), fields: z.array(field).max(8), records: z.array(z.record(z.string(), value)).max(200) });
const node: z.ZodType = z.lazy(() =>
  z.object({ path: z.string().max(24), type: z.enum([...CONTAINERS, ...PARTS] as [string, ...string[]]).nullable(), collection: z.string().max(40).optional(), bindings: z.record(z.string(), z.string().max(40)).optional(), children: z.array(node).max(4).optional() }),
);
const tree = z.object({ root: node, accent: z.string().max(12), nonsense: z.number(), bound: z.boolean() });
const body = z.object({
  state: z.object({
    prompt: z.string().trim().min(1).max(400),
    data: z.object({ collections: z.array(collection).max(4) }).nullable(),
    ui: z.object({ selected: z.record(z.string(), z.string().nullable()), filter: z.record(z.string(), z.string().max(200)), sort: z.record(z.string(), z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) })), tab: z.record(z.string(), z.number()) }),
    history: z.array(z.string().max(200)).max(20),
  }),
  tree: tree.nullable(),
  prev: tree.nullable(),
});

/** One composer step (one Decisions call). The client calls this repeatedly to render each level as it lands. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { state, tree, prev }" }, { status: 400 });
  const state = parsed.data.state as AppState;
  const started = performance.now();
  const offline = () => Response.json({ tree: fallbackTree(state), done: true, offline: true, ms: Math.round(performance.now() - started) });
  if (decisionsMode() === "offline" || !rateLimit(`compose:${clientKey(request)}`, 120, 60_000).ok) return offline();
  try {
    const r = await composeStep(state, (parsed.data.tree as Tree | null) ?? emptyTree(), parsed.data.prev as Tree | null, (input, qs) => decide(input, qs, request.signal));
    return Response.json({ ...r, offline: false, ms: Math.round(performance.now() - started) });
  } catch (e) {
    console.warn(`[compose] ${(e as Error).message}`);
    return offline();
  }
}
