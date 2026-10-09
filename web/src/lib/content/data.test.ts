import { describe, expect, test } from "vitest";
import { ContentError, toData } from "./data";

const raw = {
  collections: [
    {
      name: "Trip Expenses",
      fields: [
        { name: "Item", type: "text", values: [] },
        { name: "Amount (¥)", type: "number", values: [] },
        { name: "category", type: "choice", values: ["food", "travel"] },
        { name: "paid", type: "yesno", values: [] },
      ],
      records: [["Ramen", "980", "food", "yes"], ["Train", "2,000", "lodging", "no"]],
    },
  ],
};

describe("toData", () => {
  test("names become snake_case, cells are typed, choice cells outside values fall back", () => {
    const d = toData(raw);
    const c = d.collections[0];
    expect(c.name).toBe("trip_expenses");
    expect(c.fields.map((f) => f.name)).toEqual(["item", "amount", "category", "paid"]);
    expect(c.records[0]).toMatchObject({ item: "Ramen", amount: 980, category: "food", paid: true });
    expect(c.records[1]).toMatchObject({ amount: 2000, category: "food", paid: false });
    expect(c.records[0].id).not.toBe(c.records[1].id);
  });

  test("limits: 4 collections, 8 fields, 15 records; choice fields need values", () => {
    expect(() => toData({ collections: Array(5).fill(raw.collections[0]) })).toThrow(ContentError);
    expect(() => toData({ collections: [{ ...raw.collections[0], records: Array(16).fill(raw.collections[0].records[0]) }] })).toThrow(ContentError);
    expect(() => toData({ collections: [{ ...raw.collections[0], fields: [{ name: "s", type: "choice", values: [] }], records: [] }] })).toThrow(ContentError);
  });

  test("duplicate names get a suffix", () => {
    const d = toData({ collections: [{ ...raw.collections[0], fields: [{ name: "a", type: "text", values: [] }, { name: "A", type: "text", values: [] }], records: [] }] });
    expect(d.collections[0].fields.map((f) => f.name)).toEqual(["a", "a_2"]);
  });
});

test("the schema sent to Gemini has no array item limits (Gemini rejects them with 400); zod still enforces them", async () => {
  const { dataJsonSchema } = await import("./data");
  const json = JSON.stringify(dataJsonSchema());
  expect(json).not.toMatch(/"(min|max)Items"/);
  expect(json).toMatch(/"maxLength"/);
});
