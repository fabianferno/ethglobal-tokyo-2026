import { describe, expect, test } from "vitest";
import { ContentError, jsonSchemaFor, toBundle } from "./schema";
import { SHAPE_KEYS } from "@/lib/intent/types";

const head = { title: "Ramen", subtitle: "Best bowls in Tokyo" };

describe("toBundle", () => {
  test("table: string cells → typed rows keyed by column", () => {
    const b = toBundle("table", {
      ...head,
      columns: [{ label: "Shop", fmt: "text", unit: "" }, { label: "Price", fmt: "num", unit: "¥" }],
      rows: [["Ichiran", "980"], ["Afuri", "1,250"]],
    });
    expect(b.table!.columns.map((c) => c.key)).toEqual(["c0", "c1"]);
    expect(b.table!.rows[1]).toEqual({ c0: "Afuri", c1: 1250 });
    expect(b.actions[0].id).toBe("regenerate");
  });

  test("grid: risk > 0.72 becomes a mine", () => {
    const cell = (risk: number) => ({ label: "x", risk });
    const b = toBundle("grid", { ...head, rows: [[cell(0.1), cell(0.9)], [cell(0.5), cell(0.73)]] });
    expect(b.grid!.cells.flat().filter((c) => c.mine)).toHaveLength(2);
  });

  test("list tone none → undefined", () => {
    const b = toBundle("list", { ...head, items: [{ title: "a", subtitle: "", right: "", tone: "none" }] });
    expect(b.list!.items[0]).toEqual({ title: "a" });
  });

  test("doc over 2000 chars is rejected", () => {
    expect(() => toBundle("doc", { ...head, text: "x".repeat(2001) })).toThrow(ContentError);
  });

  test("empty table is rejected", () => {
    expect(() => toBundle("table", { ...head, columns: [{ label: "a", fmt: "text", unit: "" }], rows: [] })).toThrow(ContentError);
  });

  test("series needs ≥ 4 points and ≤ 60", () => {
    const s = (n: number) => ({ ...head, label: "pop", unit: "", points: Array(n).fill(1) });
    expect(() => toBundle("series", s(3))).toThrow(ContentError);
    expect(() => toBundle("series", s(61))).toThrow(ContentError);
    expect(toBundle("series", s(4)).series!.points).toHaveLength(4);
  });

  test("ragged table rows are padded/truncated to column count", () => {
    const b = toBundle("table", { ...head, columns: [{ label: "a", fmt: "text", unit: "" }, { label: "b", fmt: "text", unit: "" }], rows: [["1"], ["1", "2", "3"]] });
    expect(b.table!.rows).toEqual([{ c0: "1", c1: "" }, { c0: "1", c1: "2" }]);
  });
});

test("every shape has a JSON schema with no $ref", () => {
  for (const s of SHAPE_KEYS) expect(JSON.stringify(jsonSchemaFor(s))).not.toContain("$ref");
});
