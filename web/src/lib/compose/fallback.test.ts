import { expect, test } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { isComplete, partNodes } from "@/lib/kit/tree";
import { fallbackTree } from "./fallback";

const st = (fields: { name: string; type: "text" | "number" | "choice"; values?: string[] }[]) => ({
  prompt: "x", ui: emptyUi(), history: [],
  data: { collections: [{ name: "items", fields, records: [] }] },
});

test("choice field → list + detail; otherwise table + form; always complete and bound", () => {
  const a = fallbackTree(st([{ name: "title", type: "text" }, { name: "status", type: "choice", values: ["todo", "done"] }]));
  expect(partNodes(a).map((n) => n.type)).toEqual(["list", "detail"]);
  expect(a.bound && isComplete(a)).toBe(true);
  const b = fallbackTree(st([{ name: "title", type: "text" }, { name: "amount", type: "number" }]));
  expect(partNodes(b).map((n) => n.type)).toEqual(["table", "form"]);
  expect(b.root.children![0].bindings).toEqual({ col1: "title", col2: "amount" });
});

test("without data: a complete, unbound placeholder tree", () => {
  const t = fallbackTree({ prompt: "x", ui: emptyUi(), history: [], data: null });
  expect(isComplete(t)).toBe(true);
  expect(t.bound).toBe(false);
});
