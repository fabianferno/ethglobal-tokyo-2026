import { expect, test } from "vitest";
import { topK } from "@/lib/intent/types";

test("alias + imports resolve", () => {
  expect(topK({ value: "a", confidence: 1, probabilities: { a: 0.7, b: 0.3 } }, 1)).toEqual([{ value: "a", p: 0.7 }]);
});
