import { expect, test, vi } from "vitest";

const decide = vi.fn();
vi.mock("@/lib/decisions/client", () => ({ decide: (...a: unknown[]) => decide(...a), decisionsMode: () => "online" }));
const { POST } = await import("./route");

const body = (b: unknown) => new Request("http://x/api/compose", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.7" }, body: JSON.stringify(b) });
const state = { prompt: "notes", ui: { selected: {}, filter: {}, sort: {}, tab: {} }, history: [], data: null };

test("a refusal falls back to the rule-based tree, marked offline", async () => {
  decide.mockResolvedValueOnce([{ type: "refusal", name: "node:root" }]);
  const r = await (await POST(body({ state, tree: null, prev: null }))).json();
  expect(r).toMatchObject({ done: true, offline: true });
  expect(r.tree.root.type).toBe("split-h-2");
});

test("oversized or malformed state is a 400", async () => {
  expect((await POST(body({ state: { ...state, prompt: "x".repeat(401) }, tree: null, prev: null }))).status).toBe(400);
  expect((await POST(body({ state: { ...state, history: Array(21).fill("h") }, tree: null, prev: null }))).status).toBe(400);
  expect((await POST(body({ nope: 1 }))).status).toBe(400);
});

test("a crafted tree (orphan paths / too deep) or an oversized sort field is a 400", async () => {
  const orphan = { root: { path: "zz", type: null }, accent: "navy", nonsense: 0, bound: false };
  expect((await POST(body({ state, tree: orphan, prev: null }))).status).toBe(400);
  expect((await POST(body({ state, tree: null, prev: orphan }))).status).toBe(400);
  const sorted = { ...state, ui: { ...state.ui, sort: { x: { field: "f".repeat(31), dir: "asc" } } } };
  expect((await POST(body({ state: sorted, tree: null, prev: null }))).status).toBe(400);
});

test("past the daily spending limit, compose answers offline without calling Decisions", async () => {
  const { recordSpend, resetBudget } = await import("@/lib/budget");
  resetBudget();
  recordSpend(1000);
  decide.mockClear();
  const r = await (await POST(body({ state, tree: null, prev: null }))).json();
  expect(r).toMatchObject({ offline: true, done: true });
  expect(decide).not.toHaveBeenCalled();
  resetBudget();
});
