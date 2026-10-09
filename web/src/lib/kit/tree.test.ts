import { describe, expect, test } from "vitest";
import { emptyTree, isComplete, nodeKey, nodeOptions, openNodes, partNodes, setNode, treeText, validTree } from "./tree";
import type { TreeNode } from "./types";
import type { Data } from "./types";

const data: Data = { collections: [{ name: "notes", fields: [{ name: "body", type: "text" }], records: [] }] };

describe("tree", () => {
  test("a container opens its children; parts close the node", () => {
    let t = setNode(emptyTree(), "root", { type: "split-h-2" });
    expect(openNodes(t).map((n) => n.path)).toEqual(["root.0", "root.1"]);
    t = setNode(t, "root.0", { type: "list", collection: "notes" });
    t = setNode(t, "root.1", { type: "detail", collection: "notes" });
    expect(isComplete(t)).toBe(true);
    expect(partNodes(t).map((n) => n.type)).toEqual(["list", "detail"]);
    expect(treeText(t)).toBe("root=split-h-2 [root.0=list(notes), root.1=detail(notes)]");
  });

  test("depth 3 offers parts only", () => {
    let t = setNode(emptyTree(), "root", { type: "split-h-2" });
    t = setNode(t, "root.0", { type: "split-v-2" });
    const deep = openNodes(t).find((n) => n.path === "root.0.0")!;
    expect(nodeOptions(t, deep, null).some((o) => o.startsWith("split") || o.startsWith("tabs") || o === "grid-4")).toBe(false);
  });

  test("containers that would exceed 6 parts are not offered", () => {
    let t = setNode(emptyTree(), "root", { type: "grid-4" });
    // 4 open cells, each will hold ≥ 1 part: the 3 others commit 3, so one cell may hold at most 6 - 3 = 3.
    const cell = openNodes(t)[0];
    const opts = nodeOptions(t, cell, null);
    expect(opts).toContain("split-h-3");
    expect(opts).not.toContain("grid-4");
    // root.0 becomes 3 panes: 3 + 3 other cells = 6 committed → root.1 can't split at all.
    t = setNode(t, "root.0", { type: "split-h-3" });
    expect(nodeOptions(t, openNodes(t).find((n) => n.path === "root.1")!, null)).not.toContain("split-h-2");
  });

  test("with data, parts no collection can bind are not offered", () => {
    const opts = nodeOptions(emptyTree(), emptyTree().root, data);
    expect(opts).toContain("note");
    expect(opts).not.toContain("kanban");
    expect(opts).not.toContain("bar-chart");
    expect(opts).toContain("picture");
  });

  test("nodeKey changes with type or bindings, not with unrelated nodes", () => {
    const a = { path: "root.0", type: "list" as const, collection: "notes", bindings: { title: "body" } };
    expect(nodeKey(a)).toBe(nodeKey({ ...a }));
    expect(nodeKey(a)).not.toBe(nodeKey({ ...a, bindings: { title: "other" } }));
    expect(nodeKey(a)).not.toBe(nodeKey({ ...a, type: "table" }));
  });
});

describe("validTree (a client-supplied tree)", () => {
  test("accepts a real tree", () => {
    let t = setNode(emptyTree(), "root", { type: "split-h-2" });
    t = setNode(t, "root.0", { type: "list" });
    expect(validTree(t)).toBe(true);
    expect(validTree(emptyTree())).toBe(true);
  });
  test("rejects orphan paths, wrong child counts, children on parts, and depth past the cap", () => {
    expect(validTree({ ...emptyTree(), root: { path: "zz", type: null } })).toBe(false);
    expect(validTree({ ...emptyTree(), root: { path: "root", type: "split-h-2", children: [{ path: "root.0", type: null }] } })).toBe(false);
    expect(validTree({ ...emptyTree(), root: { path: "root", type: "table", children: [{ path: "root.0", type: null }] } })).toBe(false);
    const deep = (d: number, path: string): TreeNode => (d === 0 ? { path, type: null } : { path, type: "split-h-2", children: [deep(d - 1, `${path}.0`), deep(d - 1, `${path}.1`)] });
    expect(validTree({ ...emptyTree(), root: deep(3, "root") })).toBe(false);
    expect(validTree({ ...emptyTree(), root: deep(2, "root") })).toBe(true);
  });
});
