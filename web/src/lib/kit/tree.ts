import { canBind, childCount, isContainer, PART_INFO } from "./catalog";
import { CONTAINERS, type Data, type NodeType, PARTS, type Tree, type TreeNode } from "./types";

export const MAX_DEPTH = 3;
export const MAX_PARTS = 6;

export const emptyTree = (): Tree => ({ root: { path: "root", type: null }, accent: "navy", nonsense: 0, bound: false });
export const depthOf = (path: string) => path.split(".").length;

function walk(n: TreeNode, fn: (n: TreeNode) => void) {
  fn(n);
  n.children?.forEach((c) => walk(c, fn));
}
const all = (t: Tree) => {
  const out: TreeNode[] = [];
  walk(t.root, (n) => out.push(n));
  return out;
};

export const findNode = (t: Tree, path: string) => all(t).find((n) => n.path === path) ?? null;
export const openNodes = (t: Tree) => all(t).filter((n) => n.type === null);
export const partNodes = (t: Tree) => all(t).filter((n) => n.type !== null && !isContainer(n.type));
export const isComplete = (t: Tree) => openNodes(t).length === 0;

/** What this open node may become: depth and part-budget caps, and (with data) only parts some collection can bind. */
export function nodeOptions(t: Tree, node: TreeNode, data: Data | null): NodeType[] {
  // Every other open node will hold at least one part; decided parts already count.
  const committed = partNodes(t).length + openNodes(t).filter((n) => n.path !== node.path).length;
  const containers = depthOf(node.path) >= MAX_DEPTH ? [] : CONTAINERS.filter((c) => committed + childCount(c) <= MAX_PARTS);
  const parts = data ? PARTS.filter((p) => !PART_INFO[p].needsCollection || data.collections.some((c) => canBind(p, c))) : [...PARTS];
  return [...containers, ...parts];
}

function patchAt(n: TreeNode, path: string, patch: Partial<TreeNode>): TreeNode {
  if (n.path === path) {
    const next = { ...n, ...patch };
    if (patch.type && isContainer(patch.type)) next.children = Array.from({ length: childCount(patch.type) }, (_, i) => ({ path: `${path}.${i}`, type: null }));
    else if (patch.type) delete next.children;
    return next;
  }
  return n.children ? { ...n, children: n.children.map((c) => patchAt(c, path, patch)) } : n;
}
export const setNode = (t: Tree, path: string, patch: Partial<TreeNode>): Tree => ({ ...t, root: patchAt(t.root, path, patch) });

/** Identity for diffing: same key → keep the rendered component. */
export function nodeKey(n: TreeNode): string {
  const b = n.bindings ? Object.keys(n.bindings).sort().map((k) => `${k}=${n.bindings![k]}`).join(",") : "";
  return `${n.path}|${n.type ?? "?"}|${n.collection ?? ""}|${b}`;
}

/** "root=split-h-2 [root.0=list(notes), root.1=?]" — how Jev sees a tree. */
export function treeText(t: Tree): string {
  const one = (n: TreeNode): string => {
    const self = `${n.path}=${n.type ?? "?"}${n.collection ? `(${n.collection})` : ""}`;
    return n.children ? `${self} [${n.children.map(one).join(", ")}]` : self;
  };
  return one(t.root);
}
