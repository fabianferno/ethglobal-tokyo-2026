import { expect, test } from "vitest";
import { pickSuggestion, SUGGESTIONS } from "./suggest";

test("never repeats a suggestion", () => {
  const seen = new Set<string>(SUGGESTIONS.slice(0, -1));
  expect(pickSuggestion(seen, () => 0)).toBe(SUGGESTIONS[SUGGESTIONS.length - 1]);
});
test("null when all seen", () => expect(pickSuggestion(new Set<string>(SUGGESTIONS))).toBeNull());
test("no crypto words", () => expect(SUGGESTIONS.join(" ")).not.toMatch(/\b(eth|sui|wallet|portfolio|crypto|token)\b/i));
