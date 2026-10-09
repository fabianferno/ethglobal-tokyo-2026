import { describe, expect, test } from "vitest";
import { canBind, childCount, isContainer, PART_INFO, slotOptions } from "./catalog";
import { CONTAINERS, PARTS, type Collection } from "./types";

const expenses: Collection = {
  name: "expenses",
  fields: [
    { name: "item", type: "text" },
    { name: "amount", type: "number" },
    { name: "date", type: "date" },
    { name: "category", type: "choice", values: ["food", "travel"] },
    { name: "paid", type: "yesno" },
  ],
  records: [],
};
const notes: Collection = { name: "notes", fields: [{ name: "body", type: "text" }], records: [] };

describe("catalog", () => {
  test("every container and part is described", () => {
    for (const c of CONTAINERS) expect(isContainer(c)).toBe(true);
    for (const p of PARTS) expect(PART_INFO[p].description.length).toBeGreaterThan(10);
    expect(childCount("split-h-3")).toBe(3);
    expect(childCount("grid-4")).toBe(4);
  });

  test("field slots only offer fields of the allowed types", () => {
    const value = PART_INFO["bar-chart"].slots.find((s) => s.name === "value")!;
    expect(slotOptions(value, expenses)).toEqual(["amount"]);
    const column = PART_INFO.kanban.slots.find((s) => s.name === "column")!;
    expect(slotOptions(column, expenses)).toEqual(["category"]);
  });

  test("optional slots offer none", () => {
    const sub = PART_INFO.list.slots.find((s) => s.name === "subtitle")!;
    expect(slotOptions(sub, expenses)).toContain("none");
  });

  test("aggregates and buttons are built from the collection", () => {
    const agg = PART_INFO["stat-row"].slots[0];
    expect(slotOptions(agg, expenses)).toEqual(["count", "sum:amount", "avg:amount"]);
    const btn = PART_INFO["button-bar"].slots[0];
    expect(slotOptions(btn, expenses)).toEqual(expect.arrayContaining(["remove-selected", "clear-selection", "clear-filter", "sort:amount"]));
  });

  test("canBind needs every required slot to have an option", () => {
    expect(canBind("kanban", expenses)).toBe(true);
    expect(canBind("kanban", notes)).toBe(false);
    expect(canBind("note", notes)).toBe(true);
    expect(canBind("picture", notes)).toBe(true);
  });
});
