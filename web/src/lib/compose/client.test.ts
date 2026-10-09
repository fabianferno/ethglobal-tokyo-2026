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
