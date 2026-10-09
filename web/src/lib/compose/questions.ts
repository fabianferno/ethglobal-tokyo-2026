import { canBind, CONTAINER_INFO, isContainer, PART_INFO, slotOptions } from "@/lib/kit/catalog";
import { findNode, nodeOptions, openNodes, partNodes, setNode } from "@/lib/kit/tree";
import { ACCENTS, type AppState, type Bindings, type NodeType, type PartType, type Tree, type TreeNode } from "@/lib/kit/types";
import type { DecisionAnswer, Question } from "@/lib/decisions/types";

export class ComposeError extends Error {}

const ACCENT_TEXT: Record<(typeof ACCENTS)[number], string> = {
  navy: "Calm, classic, work-like", teal: "Fresh, travel, water", green: "Money, health, growth",
  purple: "Creative, playful, night", maroon: "Warm, food, serious", olive: "Outdoors, earthy, slow",
};

/** What each pane of a layout is typically for: a hint in the question (Jev still decides), so siblings divide the work. */
const ROLES: Record<string, string[]> = {
  "split-h-2": ["the items", "a way to add new items, or the selected item"],
  "split-h-3": ["the items", "the selected item", "a way to add one"],
  "split-v-2": ["headline numbers or a chart", "the items"],
  "split-v-3": ["headline numbers", "a chart", "the items"],
  "tabs-2": ["the items", "a way to add one"],
  "tabs-3": ["the items", "a summary or chart", "a way to add one"],
  "grid-4": ["headline numbers", "a chart", "the items", "a way to add one"],
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
  const role = ROLES[t]?.[i];
  return `${where}${role ? ` (usually: ${role})` : ""}, inside ${placeText(tree, parentPath)}`;
}

const describeType = (t: NodeType) => (isContainer(t) ? CONTAINER_INFO[t].description : PART_INFO[t].description);

export function levelQuestions(state: AppState, tree: Tree): Question[] {
  const qs: Question[] = [];
  const cols = state.data?.collections ?? [];
  for (const node of openNodes(tree)) {
    qs.push({
      type: "choice",
      name: `node:${node.path}`,
      instructions:
        `What should ${placeText(tree, node.path)} be? Pick a container to split it further, or a part to show something.` +
        (node.path === "root" ? " Most apps need a way to see their items and a way to change them, so a single part is rarely enough for the whole window." : ""),
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
    qs.push({ type: "predicate", name: "nonsense", instructions: "Judge only the App request in quotes: it is random letters, keyboard mashing, or otherwise not something a person would ask an app to do" });
  }
  return qs;
}

function pick(answers: DecisionAnswer[], name: string, allowed: string[]): string {
  return ranked(answers, name, allowed)[0];
}

/** Allowed options, most likely first (Jev's own probabilities; its choice first when there are none). */
function ranked(answers: DecisionAnswer[], name: string, allowed: string[]): string[] {
  return scored(answers, name, allowed).map(([v]) => v);
}

function scored(answers: DecisionAnswer[], name: string, allowed: string[]): [string, number][] {
  const a = answers.find((x) => x.name === name);
  if (!a || a.type !== "choice" || !allowed.includes(a.choice)) throw new ComposeError(`no usable answer for ${name}`);
  const p = new Map<string, number>();
  a.probabilities.forEach((x, i) => (typeof x === "number" ? p.set(allowed[i], x) : p.set(x.value, x.probability)));
  p.set(a.choice, Math.max(p.get(a.choice) ?? 0, ...p.values(), 0) + 1e-9);
  return allowed.map((v): [string, number] => [v, p.get(v) ?? 0]).sort((x, y) => y[1] - x[1]);
}

/** Re-composes keep a pane's previous type while Jev still rates it this close to its top pick (no flicker). */
const STICKY = 0.6;
function withStickiness(options: [string, number][], previous: string | null | undefined): string[] {
  const top = options[0]?.[1] ?? 0;
  const kept = previous ? options.find(([v]) => v === previous) : undefined;
  const order = options.map(([v]) => v);
  if (kept && kept[1] >= STICKY * top) return [kept[0], ...order.filter((v) => v !== kept[0])];
  return order;
}

export function applyLevel(state: AppState, tree: Tree, answers: DecisionAnswer[], prev: Tree | null = null): Tree {
  let t = tree;
  const cols = state.data?.collections ?? [];
  // Siblings are decided in one parallel call and can't see each other: when a part would repeat a sibling's
  // part + collection, take Jev's next most likely option instead.
  const taken = new Map<string, Set<string>>();
  const collectionFor = (node: TreeNode, type: PartType): string | undefined => {
    if (!PART_INFO[type].needsCollection || !cols.length) return undefined;
    const asked = cols.length >= 2 ? pick(answers, `collection:${node.path}`, cols.map((c) => c.name)) : cols[0].name;
    const fits = (name: string) => canBind(type, cols.find((c) => c.name === name)!);
    let c = fits(asked) ? asked : cols.find((x) => fits(x.name))?.name;
    if (!c) throw new ComposeError(`no collection can show ${type}`);
    // A detail view of a collection with nothing selected shows nothing: follow the selection.
    if (type === "detail" && !state.ui.selected[c]) c = cols.find((x) => state.ui.selected[x.name])?.name ?? c;
    return c;
  };
  for (const node of openNodes(tree)) {
    const parent = node.path.slice(0, Math.max(0, node.path.lastIndexOf(".")));
    const seen = taken.get(parent) ?? new Set<string>();
    taken.set(parent, seen);
    const options = withStickiness(scored(answers, `node:${node.path}`, nodeOptions(tree, node, state.data)), prev && findNode(prev, node.path)?.type) as NodeType[];
    let chosen: { type: NodeType; collection?: string } | null = null;
    for (const type of options) {
      if (isContainer(type)) {
        chosen = { type };
        break;
      }
      const collection = collectionFor(node, type);
      if (seen.has(`${type}|${collection ?? ""}`)) continue;
      chosen = { type, collection };
      break;
    }
    if (!chosen) {
      const type = options[0];
      chosen = isContainer(type) ? { type } : { type, collection: collectionFor(node, type as PartType) };
    }
    if (!isContainer(chosen.type)) seen.add(`${chosen.type}|${chosen.collection ?? ""}`);
    t = setNode(t, node.path, chosen.collection ? chosen : { type: chosen.type });
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
      // A part's slots shouldn't repeat each other (two "sum of amount" stats, the same column twice).
      const used = new Set(Object.values(bindings));
      const value = options.length === 1 ? options[0] : (ranked(answers, `bind:${node.path}:${slot.name}`, options).find((o) => o === "none" || !used.has(o)) ?? "none");
      if (value !== "none" && !(used.has(value) && slot.optional)) bindings[slot.name] = value;
    }
    t = setNode(t, node.path, { bindings });
  }
  return { ...t, bound: true };
}
