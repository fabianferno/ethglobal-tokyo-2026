import { isComplete } from "@/lib/kit/tree";
import type { AppState, Tree } from "@/lib/kit/types";
import type { DecisionAnswer, Question } from "@/lib/decisions/types";
import { describe } from "./describe";
import { applyBind, applyLevel, bindQuestions, levelQuestions } from "./questions";

export type Decide = (input: string, questions: Question[]) => Promise<DecisionAnswer[]>;

/** One step = at most one Decisions call: the next tree level, or (when complete and data exists) the bindings. */
export async function composeStep(state: AppState, tree: Tree, prev: Tree | null, decide: Decide): Promise<{ tree: Tree; done: boolean }> {
  if (!isComplete(tree)) {
    const next = applyLevel(state, tree, await decide(describe(state, tree, prev), levelQuestions(state, tree)), prev);
    return { tree: next, done: isComplete(next) && !state.data };
  }
  if (!state.data || tree.bound) return { tree, done: true };
  const qs = bindQuestions(state, tree);
  const answers = qs.length ? await decide(describe(state, tree, prev), qs) : [];
  return { tree: applyBind(state, tree, answers), done: true };
}
