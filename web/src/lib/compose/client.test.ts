import { expect, test, vi } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { setNode, emptyTree } from "@/lib/kit/tree";
import { fetchData, runCompose, type Step } from "./client";

const state = { prompt: "notes", data: null, ui: emptyUi(), history: [] };
const t1 = setNode(emptyTree(), "root", { type: "split-h-2" });
const t2 = setNode(setNode(t1, "root.0", { type: "list" }), "root.1", { type: "detail" });

test("renders every step's tree and stops when done", async () => {
  const step: Step = vi.fn().mockResolvedValueOnce({ tree: t1, done: false, offline: false, ms: 300 }).mockResolvedValueOnce({ tree: t2, done: true, offline: false, ms: 310 });
  const seen: string[] = [];
  const r = await runCompose(state, null, (t) => seen.push(t.root.type!), { step });
  expect(seen).toEqual(["split-h-2", "split-h-2"]);
  expect(r).toMatchObject({ calls: 2, ms: 610, offline: false });
});

test("a superseded compose renders nothing more and returns null", async () => {
  let current = true;
  const step: Step = vi.fn(async () => {
    current = false;
    return { tree: t1, done: false, offline: false, ms: 1 };
  });
  const onTree = vi.fn();
  expect(await runCompose(state, null, onTree, { step, isCurrent: () => current })).toBeNull();
  expect(onTree).not.toHaveBeenCalled();
});

test("maxSteps bounds a runaway loop", async () => {
  const step: Step = vi.fn(async () => ({ tree: t1, done: false, offline: false, ms: 1 }));
  await runCompose(state, null, () => {}, { step, maxSteps: 3 });
  expect(step).toHaveBeenCalledTimes(3);
});

test("fetchData maps failures to plain sentences", async () => {
  const res = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch;
  await expect(fetchData("x", 1, res(429))).rejects.toThrow("Too many apps at once. Wait a few seconds and try again.");
  await expect(fetchData("x", 2, res(502))).rejects.toThrow("Couldn't write this one.");
  const boom = vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
  await expect(fetchData("x", 3, boom)).rejects.toThrow("Gemini took too long. Try again.");
});

test("with a previous tree, only the final tree is shown (no blank-out while re-composing)", async () => {
  const step: Step = vi.fn().mockResolvedValueOnce({ tree: t1, done: false, offline: false, ms: 1 }).mockResolvedValueOnce({ tree: t2, done: true, offline: false, ms: 1 });
  const seen: string[] = [];
  await runCompose(state, t2, (t) => seen.push(String(t.root.children?.[0]?.type)), { step });
  expect(seen).toEqual(["list"]);
});

test("a failing step keeps the previous tree and reports offline", async () => {
  const step: Step = vi.fn(async () => {
    throw new Error("network");
  });
  const onTree = vi.fn();
  const r = await runCompose(state, t2, onTree, { step });
  expect(r).toMatchObject({ tree: t2, offline: true });
  expect(onTree).toHaveBeenCalledWith(t2);
});

test("state sent to the server is clamped to the route's limits", async () => {
  const { clampState } = await import("./client");
  const big = { prompt: "p".repeat(500), data: { collections: [{ name: "c", fields: [{ name: "t", type: "text" as const }], records: Array.from({ length: 250 }, (_, i) => ({ id: `r${i}`, t: "v".repeat(300) })) }] }, ui: { ...emptyUi(), filter: { c: "f".repeat(300) } }, history: Array(30).fill("h".repeat(300)) };
  const s = clampState(big);
  expect(s.prompt.length).toBe(400);
  expect(s.history).toHaveLength(20);
  expect(s.history[0].length).toBe(200);
  expect(s.data!.collections[0].records).toHaveLength(200);
  expect(String(s.data!.collections[0].records[0].t).length).toBe(200);
  expect(s.ui.filter.c.length).toBe(200);
});
