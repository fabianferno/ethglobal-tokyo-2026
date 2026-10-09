import { expect, test, vi } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { emptyTree } from "@/lib/kit/tree";
import type { DecisionAnswer, Question } from "@/lib/decisions/types";
import { composeStep, type Decide } from "./step";

const state = { prompt: "notes", ui: emptyUi(), history: [], data: { collections: [{ name: "notes", fields: [{ name: "body", type: "text" as const }], records: [] }] } };

/** Answers every question with its first option (and 0 for predicates). */
const firstOption: Decide = async (_input: string, qs: Question[]): Promise<DecisionAnswer[]> =>
  qs.map((q) => (q.type === "choice" ? { type: "choice", name: q.name, choice: q.choices.find((c) => !c.value.startsWith("split") && !c.value.startsWith("tabs") && c.value !== "grid-4")!.value, probabilities: [] } : { type: "predicate", name: q.name, probability: 0 }));

test("one Decisions call per step: level steps until complete, then one bind step", async () => {
  const decide = vi.fn(firstOption);
  let r = await composeStep(state, emptyTree(), null, decide);
  expect(decide).toHaveBeenCalledTimes(1);
  expect(r.tree.root.type).not.toBeNull();
  expect(r.done).toBe(false); // data exists → bind still to do
  r = await composeStep(state, r.tree, null, decide);
  expect(r.done).toBe(true);
  expect(r.tree.bound).toBe(true);
});

test("without data the tree is done once complete (no bind step)", async () => {
  const r = await composeStep({ ...state, data: null }, emptyTree(), null, firstOption);
  expect(r.done).toBe(true);
});

test("a bind step with no questions makes no call", async () => {
  const decide = vi.fn(firstOption);
  let r = await composeStep(state, emptyTree(), null, decide);
  r = await composeStep({ ...state, data: { collections: [{ name: "x", fields: [], records: [] }] } }, { ...r.tree, root: { path: "root", type: "picture" } }, null, decide);
  expect(r.done).toBe(true);
  expect(decide).toHaveBeenCalledTimes(1);
});
