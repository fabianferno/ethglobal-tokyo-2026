import type { AppState, Data, Tree } from "@/lib/kit/types";

export type StepResult = { tree: Tree; done: boolean; offline: boolean; ms: number };
export type Step = (state: AppState, tree: Tree | null, prev: Tree | null) => Promise<StepResult>;

const clip = (v: unknown, n: number) => (typeof v === "string" && v.length > n ? v.slice(0, n) : v);

/** The state trimmed to what /api/compose accepts, so one long title or a big list never blocks re-composing. */
export function clampState(s: AppState): AppState {
  const filter = Object.fromEntries(Object.entries(s.ui.filter).map(([k, v]) => [k, String(clip(v, 200))]));
  const data = s.data && {
    collections: s.data.collections.map((c) => ({
      ...c,
      records: c.records.slice(-200).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, clip(v, 200)])) as typeof r),
    })),
  };
  return { prompt: s.prompt.slice(0, 400), data, ui: { ...s.ui, filter }, history: s.history.slice(-20).map((h) => h.slice(0, 200)) };
}

export const fetchStep: Step = async (state, tree, prev) => {
  const res = await fetch("/api/compose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: clampState(state), tree, prev }), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`compose ${res.status}`);
  return (await res.json()) as StepResult;
};

/**
 * Compose a whole tree, one Decisions call per step. The first composition renders every step as it lands (you
 * watch Jev design it); a re-compose keeps showing the previous tree and swaps in only the finished one, so parts
 * never blank out mid-interaction. A failed step keeps the previous tree and reports offline.
 */
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
  const reveal = !prev;
  for (let i = 0; i < (opts.maxSteps ?? 6); i++) {
    let r: StepResult;
    try {
      r = await step(state, tree, prev);
    } catch (e) {
      if (!isCurrent()) return null;
      if (!prev) throw e;
      onTree(prev);
      return { tree: prev, calls, ms, offline: true };
    }
    if (!isCurrent()) return null;
    calls += r.offline ? 0 : 1;
    ms += r.ms;
    offline ||= r.offline;
    tree = r.tree;
    if (reveal || r.done) onTree(tree);
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
    const j = (await res.json().catch(() => ({}))) as { data?: Data; error?: string };
    if (res.ok && j.data) return j.data;
    if (res.status === 429) throw new Error("Too many apps at once. Wait a few seconds and try again.");
    // Spending limit / all-visitors cap: the server's own plain sentence.
    if (res.status === 503 && j.error) throw new Error(j.error);
    if (res.status === 400) throw new Error("That prompt can't be turned into an app.");
    throw new Error("Couldn't write this one.");
  })();
  dataCache.set(key, p);
  p.catch(() => dataCache.delete(key));
  return p;
}
