import { canBind, CONTAINER_INFO, isContainer, PART_INFO, slotOptions } from "@/lib/kit/catalog";
import { findNode, nodeOptions, openNodes, partNodes, setNode } from "@/lib/kit/tree";
import { ACCENTS, type AppState, type Bindings, type NodeType, type PartType, type Tree, type TreeNode } from "@/lib/kit/types";
import type { DecisionAnswer, Question } from "@/lib/decisions/types";

export class ComposeError extends Error {}

const ACCENT_TEXT: Record<(typeof ACCENTS)[number], string> = {
  navy: "Calm, classic, work-like", teal: "Fresh, travel, water", green: "Money, health, growth",
  purple: "Creative, playful, night", maroon: "Warm, food, serious", olive: "Outdoors, earthy, slow",
};

/** "the right pane of a side-by-side split" — where a node sits, in words. */
export function placeText(tree: Tree, path: string): string {
  if (path === "root") return "the whole app window";
  const parentPath = path.slice(0, path.lastIndexOf("."));
  const i = Number(path.slice(path.lastIndexOf(".") + 1));
  const parent = findNode(tree, parentPath)!;
  const t = parent.type!;
  const n = CONTAINER_INFO[t as keyof typeof CONTAINER_INFO]?.children ?? 0;
  const where = t.startsWith("split-h") ? `pane ${i + 1} of ${n}, side by side` : t.startsWith("split-v") ? `pane ${i + 1} of ${n}, stacked top to bottom` : t.startsWith("tabs") ? `tab ${i + 1} of ${n}` : `cell ${i + 1} of a 2x2 grid`;
  return `${where}, inside ${placeText(tree, parentPath)}`;
}

const describeType = (t: NodeType) => (isContainer(t) ? CONTAINER_INFO[t].description : PART_INFO[t].description);

export function levelQuestions(state: AppState, tree: Tree): Question[] {
  const qs: Question[] = [];
  const cols = state.data?.collections ?? [];
  for (const node of openNodes(tree)) {
    qs.push({
      type: "choice",
      name: `node:${node.path}`,
      instructions: `What should ${placeText(tree, node.path)} be? Pick a container to split it further, or a part to show something.`,
      choices: nodeOptions(tree, node, state.data).map((t) => ({ value: t, description: describeType(t) })),
    });
    if (cols.length >= 2)
      qs.push({
        type: "choice",
        name: `collection:${node.path}`,
        instructions: `If ${placeText(tree, node.path)} shows data, which collection should it show?`,
        choices: cols.map((c) => ({ value: c.name, description: `${c.name}: ${c.fields.map((f) => f.name).join(", ")}` })),
      });
  }
  if (tree.root.type === null) {
    qs.push({ type: "choice", name: "accent", instructions: "Which accent colour fits this app?", choices: ACCENTS.map((a) => ({ value: a, description: ACCENT_TEXT[a] })) });
    qs.push({ type: "predicate", name: "nonsense", instructions: "The request is gibberish or is not a request for any kind of app" });
  }
  return qs;
}

function pick(answers: DecisionAnswer[], name: string, allowed: string[]): string {
  const a = answers.find((x) => x.name === name);
  if (!a || a.type !== "choice" || !allowed.includes(a.choice)) throw new ComposeError(`no usable answer for ${name}`);
  return a.choice;
}

export function applyLevel(state: AppState, tree: Tree, answers: DecisionAnswer[]): Tree {
  let t = tree;
  const cols = state.data?.collections ?? [];
  for (const node of openNodes(tree)) {
    const type = pick(answers, `node:${node.path}`, nodeOptions(tree, node, state.data)) as NodeType;
    let collection: string | undefined;
    if (!isContainer(type) && PART_INFO[type].needsCollection && cols.length) {
      const asked = cols.length >= 2 ? pick(answers, `collection:${node.path}`, cols.map((c) => c.name)) : cols[0].name;
      const fits = (name: string) => canBind(type as PartType, cols.find((c) => c.name === name)!);
      collection = fits(asked) ? asked : cols.find((c) => fits(c.name))?.name;
      if (!collection) throw new ComposeError(`no collection can show ${type}`);
    }
    t = setNode(t, node.path, collection ? { type, collection } : { type });
  }
  if (tree.root.type === null) {
    t = { ...t, accent: pick(answers, "accent", [...ACCENTS]) as Tree["accent"] };
    const ns = answers.find((x) => x.name === "nonsense");
    t = { ...t, nonsense: ns?.type === "predicate" ? ns.probability : 0 };
  }
  return t;
}

/** Slots that need a question (more than one option); single-option required slots are filled without asking. */
function slotPlan(state: AppState, node: TreeNode) {
  const col = state.data!.collections.find((c) => c.name === node.collection);
  if (!col) return [];
  return PART_INFO[node.type as PartType].slots.map((slot) => ({ slot, options: slotOptions(slot, col) }));
}

export function bindQuestions(state: AppState, tree: Tree): Question[] {
  const qs: Question[] = [];
  for (const node of partNodes(tree)) {
    for (const { slot, options } of slotPlan(state, node)) {
      if (options.length <= 1) continue;
      qs.push({
        type: "choice",
        name: `bind:${node.path}:${slot.name}`,
        instructions: `For the ${node.type} at ${placeText(tree, node.path)} (showing ${node.collection}): what should be its ${slot.question}?`,
        choices: options.map((o) => ({ value: o, description: o === "none" ? "Leave this empty" : o })),
      });
    }
  }
  return qs;
}

export function applyBind(state: AppState, tree: Tree, answers: DecisionAnswer[]): Tree {
  let t = tree;
  for (const node of partNodes(tree)) {
    const bindings: Bindings = {};
    for (const { slot, options } of slotPlan(state, node)) {
      const value = options.length === 1 ? options[0] : pick(answers, `bind:${node.path}:${slot.name}`, options);
      if (value !== "none") bindings[slot.name] = value;
    }
    t = setNode(t, node.path, { bindings });
  }
  return { ...t, bound: true };
}
