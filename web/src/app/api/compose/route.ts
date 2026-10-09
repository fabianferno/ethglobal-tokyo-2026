import { z } from "zod";
import { fallbackTree } from "@/lib/compose/fallback";
import { composeStep } from "@/lib/compose/step";
import { decide, decisionsMode } from "@/lib/decisions/client";
import { emptyTree, validTree } from "@/lib/kit/tree";
import { CONTAINERS, PARTS, type AppState, type Tree } from "@/lib/kit/types";
import { globalPerHour, overBudget } from "@/lib/budget";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const value = z.union([z.string().max(200), z.number(), z.boolean()]);
const field = z.object({ name: z.string().max(30), type: z.enum(["text", "number", "date", "yesno", "choice"]), values: z.array(z.string().max(30)).max(8).optional() });
const record = z.record(z.string().max(30), value).refine((r) => Object.keys(r).length <= 9, "too many fields");
const collection = z.object({ name: z.string().max(40), fields: z.array(field).max(8), records: z.array(record).max(200) });
const node: z.ZodType = z.lazy(() =>
  z.object({ path: z.string().max(24), type: z.enum([...CONTAINERS, ...PARTS] as [string, ...string[]]).nullable(), collection: z.string().max(40).optional(), bindings: z.record(z.string(), z.string().max(40)).optional(), children: z.array(node).max(4).optional() }),
);
// Structure is checked too: a crafted deep/odd tree would cost seconds of CPU and a huge Decisions request.
const tree = z.object({ root: node, accent: z.string().max(12), nonsense: z.number(), bound: z.boolean() }).refine((t) => validTree(t as Tree), "malformed tree");
const body = z.object({
  state: z.object({
    prompt: z.string().trim().min(1).max(400),
    data: z.object({ collections: z.array(collection).max(4) }).nullable(),
    ui: z.object({
      selected: z.record(z.string().max(40), z.string().max(40).nullable()),
      filter: z.record(z.string().max(50), z.string().max(200)),
      sort: z.record(z.string().max(40), z.object({ field: z.string().max(30), dir: z.enum(["asc", "desc"]) })),
      tab: z.record(z.string().max(40), z.number()),
    }),
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
  // No paid call past the daily spending limit, the per-visitor limit, or the all-visitors hourly cap.
  if (decisionsMode() === "offline" || overBudget() || !rateLimit(`compose:${clientKey(request)}`, 120, 60_000).ok || !rateLimit("compose:global", globalPerHour("COMPOSE", 3000), 3_600_000).ok) return offline();
  try {
    const r = await composeStep(state, (parsed.data.tree as Tree | null) ?? emptyTree(), parsed.data.prev as Tree | null, (input, qs) => decide(input, qs, request.signal));
    return Response.json({ ...r, offline: false, ms: Math.round(performance.now() - started) });
  } catch (e) {
    console.warn(`[compose] ${(e as Error).message}`);
    return offline();
  }
}
