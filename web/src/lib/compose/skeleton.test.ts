import { expect, test } from "vitest";
import { SHAPE_KEYS } from "@/lib/intent/types";
import { skeletonBundle } from "./skeleton";

const FIELD = { table: "table", list: "list", series: "series", gauge: "gauge", scene: "scene", grid: "grid", doc: "doc", picture: "list" } as const;

test.each(SHAPE_KEYS)("%s skeleton carries its data field", (shape) => {
  const b = skeletonBundle(shape, "Cats");
  expect(b[FIELD[shape]]).toBeDefined();
  expect(b.title).toBe("Cats");
  expect(b.subtitle).toBe("Jev is writing…");
  expect(b.actions).toEqual([]);
});
