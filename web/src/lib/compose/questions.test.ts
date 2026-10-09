import { describe, expect, test } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { emptyTree, isComplete, setNode } from "@/lib/kit/tree";
import type { AppState, Data } from "@/lib/kit/types";
import type { DecisionAnswer } from "@/lib/decisions/types";
import { applyBind, applyLevel, bindQuestions, ComposeError, levelQuestions } from "./questions";
import { describe as describeState } from "./describe";

const data: Data = {
  collections: [
    { name: "expenses", fields: [{ name: "item", type: "text" }, { name: "amount", type: "number" }, { name: "category", type: "choice", values: ["food", "travel"] }], records: [{ id: "a", item: "ramen", amount: 980, category: "food" }] },
    { name: "budget", fields: [{ name: "label", type: "text" }, { name: "limit", type: "number" }], records: [] },
  ],
};
const st = (d: Data | null): AppState => ({ prompt: "expense tracker for my tokyo trip", data: d, ui: emptyUi(), history: ["added \"ramen\" to expenses"] });
const choice = (name: string, c: string): DecisionAnswer => ({ type: "choice", name, choice: c, probabilities: [] });

describe("level questions", () => {
  test("first call: root node + accent + nonsense; no collection question without data", () => {
    const qs = levelQuestions(st(null), emptyTree());
    expect(qs.map((q) => q.name)).toEqual(["node:root", "accent", "nonsense"]);
  });

  test("with 2+ collections each open node also gets a collection question", () => {
    const t = setNode(emptyTree(), "root", { type: "split-h-2" });
    const qs = levelQuestions(st(data), t);
    expect(qs.map((q) => q.name)).toEqual(["node:root.0", "collection:root.0", "node:root.1", "collection:root.1"]);
  });

  test("applyLevel sets types, opens children, records accent and nonsense", () => {
    const t = applyLevel(st(null), emptyTree(), [choice("node:root", "split-h-2"), choice("accent", "teal"), { type: "predicate", name: "nonsense", probability: 0.02 }]);
    expect(t.root.type).toBe("split-h-2");
    expect(t.accent).toBe("teal");
    expect(t.nonsense).toBe(0.02);
    expect(t.root.children).toHaveLength(2);
  });

  test("a part whose chosen collection can't bind it moves to one that can", () => {
    const t0 = setNode(emptyTree(), "root", { type: "split-h-2" });
    const t = applyLevel(st(data), t0, [choice("node:root.0", "bar-chart"), choice("collection:root.0", "budget"), choice("node:root.1", "list"), choice("collection:root.1", "budget")]);
    // budget has text + number, so bar-chart can bind there; list too.
    expect(t.root.children![0].collection).toBe("budget");
    const t2 = applyLevel(st(data), t0, [choice("node:root.0", "kanban"), choice("collection:root.0", "budget"), choice("node:root.1", "list"), choice("collection:root.1", "expenses")]);
    expect(t2.root.children![0].collection).toBe("expenses"); // only expenses has a choice field
  });

  test("an option we didn't offer, or a refusal, is a ComposeError", () => {
    expect(() => applyLevel(st(null), emptyTree(), [choice("node:root", "carousel"), choice("accent", "teal"), { type: "predicate", name: "nonsense", probability: 0 }])).toThrow(ComposeError);
    expect(() => applyLevel(st(null), emptyTree(), [{ type: "refusal", name: "node:root" }, choice("accent", "teal"), { type: "predicate", name: "nonsense", probability: 0 }])).toThrow(ComposeError);
  });
});

describe("bind questions", () => {
  const tree = () => {
    let t = setNode(emptyTree(), "root", { type: "split-h-2" });
    t = setNode(t, "root.0", { type: "stat-row", collection: "expenses" });
    t = setNode(t, "root.1", { type: "bar-chart", collection: "expenses" });
    return t;
  };

  test("one question per slot, options type-filtered, single-option required slots auto-filled", () => {
    const qs = bindQuestions(st(data), tree());
    const names = qs.map((q) => q.name);
    expect(names).toContain("bind:root.0:agg1");
    expect(names).not.toContain("bind:root.1:value"); // only "amount" fits → auto
    const agg = qs.find((q) => q.name === "bind:root.0:agg1")!;
    expect(agg.type === "choice" && agg.choices.map((c) => c.value)).toEqual(["count", "sum:amount", "avg:amount"]);
  });

  test("applyBind stores bindings (none omitted) and marks the tree bound", () => {
    const t = applyBind(st(data), tree(), [
      choice("bind:root.0:agg1", "sum:amount"), choice("bind:root.0:agg2", "count"), choice("bind:root.0:agg3", "none"),
      choice("bind:root.1:label", "item"),
    ]);
    expect(t.bound).toBe(true);
    expect(t.root.children![0].bindings).toEqual({ agg1: "sum:amount", agg2: "count" });
    expect(t.root.children![1].bindings).toEqual({ label: "item", value: "amount" });
    expect(isComplete(t)).toBe(true);
  });
});

test("describe() shows prompt, schema, ui, recent history and the tree so far", () => {
  const text = describeState(st(data), setNode(emptyTree(), "root", { type: "split-h-2" }), null);
  expect(text).toContain('App: "expense tracker for my tokyo trip"');
  expect(text).toContain("expenses (1 record): item (text), amount (number), category (choice: food, travel)");
  expect(text).toContain('added "ramen" to expenses');
  expect(text).toContain("Layout so far: root=split-h-2 [root.0=?, root.1=?]");
});

describe("variety from Jev's own probabilities", () => {
  const ranked = (name: string, order: [string, number][]): DecisionAnswer => ({ type: "choice", name, choice: order[0][0], probabilities: order.map(([value, probability]) => ({ value, probability })) });

  test("a sibling that repeats an earlier sibling's part + collection takes its next most likely part", () => {
    const t0 = setNode(emptyTree(), "root", { type: "split-h-3" });
    const one: Data = { collections: [data.collections[0]] };
    const t = applyLevel(st(one), t0, [
      ranked("node:root.0", [["table", 0.6], ["list", 0.3]]),
      ranked("node:root.1", [["table", 0.5], ["bar-chart", 0.4], ["list", 0.1]]),
      ranked("node:root.2", [["table", 0.7], ["list", 0.2], ["form", 0.1]]),
    ]);
    expect(t.root.children!.map((c) => c.type)).toEqual(["table", "bar-chart", "list"]);
  });

  test("repeated binding values within a part take the next most likely option", () => {
    const one: AppState = st({ collections: [data.collections[0]] });
    let t = setNode(emptyTree(), "root", { type: "stat-row", collection: "expenses" });
    t = applyBind(one, t, [
      ranked("bind:root:agg1", [["sum:amount", 0.6], ["count", 0.3], ["avg:amount", 0.1]]),
      ranked("bind:root:agg2", [["sum:amount", 0.5], ["avg:amount", 0.3], ["count", 0.2]]),
      ranked("bind:root:agg3", [["sum:amount", 0.5], ["none", 0.4], ["count", 0.1]]),
    ]);
    expect(t.root.bindings).toEqual({ agg1: "sum:amount", agg2: "avg:amount" });
  });
});

test("the root question nudges toward apps you can both read and change", () => {
  const root = levelQuestions(st(null), emptyTree())[0];
  expect(root.instructions).toMatch(/a way to see .* and a way to change/);
});
