import { describe, expect, test } from "vitest";
import { aggregate, applyOp, emptyUi, visibleRecords } from "./ops";
import type { AppState } from "./types";

const base = (): AppState => ({
  prompt: "expense tracker",
  ui: emptyUi(),
  history: [],
  data: {
    collections: [
      {
        name: "expenses",
        fields: [
          { name: "item", type: "text" },
          { name: "amount", type: "number" },
          { name: "category", type: "choice", values: ["food", "travel"] },
          { name: "paid", type: "yesno" },
        ],
        records: [
          { id: "a", item: "ramen", amount: 980, category: "food", paid: true },
          { id: "b", item: "train", amount: 2000, category: "travel", paid: false },
        ],
      },
    ],
  },
});
const col = (s: AppState) => s.data!.collections[0];

describe("ops", () => {
  test("add coerces input by field type and writes history", () => {
    const s = applyOp(base(), { kind: "add", collection: "expenses", values: { item: "sushi", amount: "¥1,250", category: "nope", paid: "yes" } }, () => "c");
    expect(col(s).records.at(-1)).toEqual({ id: "c", item: "sushi", amount: 1250, category: "food", paid: true });
    expect(s.history.at(-1)).toBe('added "sushi" to expenses');
  });

  test("update, remove (clears selection of the removed record), select", () => {
    let s = applyOp(base(), { kind: "select", collection: "expenses", id: "a" });
    expect(s.ui.selected.expenses).toBe("a");
    expect(s.history.at(-1)).toBe('selected "ramen" in expenses');
    s = applyOp(s, { kind: "update", collection: "expenses", id: "b", field: "paid", value: true });
    expect(col(s).records[1].paid).toBe(true);
    s = applyOp(s, { kind: "remove", collection: "expenses", id: "a" });
    expect(col(s).records.map((r) => r.id)).toEqual(["b"]);
    expect(s.ui.selected.expenses).toBeNull();
  });

  test("filter and sort shape the visible records; clear resets", () => {
    let s = applyOp(base(), { kind: "filter", collection: "expenses", query: "TRA", field: "item" });
    expect(visibleRecords(col(s), s.ui).map((r) => r.id)).toEqual(["b"]);
    s = applyOp(s, { kind: "clear", collection: "expenses", what: "filter" });
    s = applyOp(s, { kind: "sort", collection: "expenses", field: "amount" });
    expect(visibleRecords(col(s), s.ui).map((r) => r.id)).toEqual(["a", "b"]);
    s = applyOp(s, { kind: "sort", collection: "expenses", field: "amount" });
    expect(visibleRecords(col(s), s.ui).map((r) => r.id)).toEqual(["b", "a"]);
    expect(s.history.at(-1)).toBe("sorted expenses by amount (desc)");
  });

  test("aggregates respect the filter and are 0 on empty", () => {
    const s = base();
    expect(aggregate(col(s), s.ui, "count")).toBe(2);
    expect(aggregate(col(s), s.ui, "sum:amount")).toBe(2980);
    expect(aggregate(col(s), s.ui, "avg:amount")).toBe(1490);
    const f = applyOp(s, { kind: "filter", collection: "expenses", query: "zzz", field: "item" });
    expect(aggregate(col(f), f.ui, "avg:amount")).toBe(0);
    expect(aggregate(col(f), f.ui, "count")).toBe(0);
  });

  test("ops on an unknown collection or record leave state unchanged", () => {
    const s = base();
    expect(applyOp(s, { kind: "remove", collection: "nope", id: "a" })).toBe(s);
    expect(applyOp(s, { kind: "update", collection: "expenses", id: "zz", field: "paid", value: true })).toBe(s);
  });

  test("history keeps the last 20 lines", () => {
    let s = base();
    for (let i = 0; i < 25; i++) s = applyOp(s, { kind: "select", collection: "expenses", id: i % 2 ? "a" : "b" });
    expect(s.history).toHaveLength(20);
  });
});

test("history lines stay short even for very long titles", () => {
  const long = "x".repeat(300);
  const s = applyOp(base(), { kind: "add", collection: "expenses", values: { item: long } }, () => "z");
  expect(s.history.at(-1)!.length).toBeLessThanOrEqual(120);
});

test("liveBindings drops bindings to fields the collection no longer has", async () => {
  const { liveBindings } = await import("./ops");
  const c = base().data!.collections[0];
  expect(liveBindings({ field1: "item", field2: "cost", agg1: "sum:cost", agg2: "count", btn1: "sort:cost", btn2: "clear-filter" }, c)).toEqual({ field1: "item", agg2: "count", btn2: "clear-filter" });
});
