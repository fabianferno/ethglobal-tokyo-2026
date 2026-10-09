import type { AppState, Data, Tree } from "@/lib/kit/types";

export type StepResult = { tree: Tree; done: boolean; offline: boolean; ms: number };
export type Step = (state: AppState, tree: Tree | null, prev: Tree | null) => Promise<StepResult>;

export const fetchStep: Step = async (state, tree, prev) => {
  const res = await fetch("/api/compose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state, tree, prev }), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`compose ${res.status}`);
  return (await res.json()) as StepResult;
};

/** Compose a whole tree, one Decisions call per step, rendering each step as it lands. */
export async function runCompose(
  state: AppState,
  prev: Tree | null,
  onTree: (t: Tree) => void,
  opts: { step?: Step; isCurrent?: () => boolean; maxSteps?: number } = {},
): Promise<{ tree: Tree; calls: number; ms: number; offline: boolean } | null> {
  const step = opts.step ?? fetchStep;
  const isCurrent = opts.isCurrent ?? (() => true);
  let tree: Tree | null = null;
  let calls = 0, ms = 0, offline = false;
  for (let i = 0; i < (opts.maxSteps ?? 6); i++) {
    const r = await step(state, tree, prev);
    if (!isCurrent()) return null;
    calls += r.offline ? 0 : 1;
    ms += r.ms;
    offline ||= r.offline;
    tree = r.tree;
    onTree(tree);
    if (r.done) break;
  }
  return tree ? { tree, calls, ms, offline } : null;
}

const dataCache = new Map<string, Promise<Data>>();
export function fetchData(prompt: string, nonce: number, f: typeof fetch = fetch): Promise<Data> {
  const key = `${prompt.trim().toLowerCase()}|${nonce}`;
  const hit = dataCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    let res: Response;
    try {
      res = await f("/api/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, nonce }), signal: AbortSignal.timeout(25_000) });
    } catch {
      throw new Error("Gemini took too long. Try again.");
    }
    const j = (await res.json().catch(() => ({}))) as { data?: Data };
    if (res.ok && j.data) return j.data;
    if (res.status === 429) throw new Error("Too many apps at once. Wait a few seconds and try again.");
    if (res.status === 400) throw new Error("That prompt can't be turned into an app.");
    throw new Error("Couldn't write this one.");
  })();
  dataCache.set(key, p);
  p.catch(() => dataCache.delete(key));
  return p;
}
