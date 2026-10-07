import { expect, test } from "vitest";
import { fmt } from "./Widgets";

test.each([
  [14000, "num", "", "14,000"],
  [21.5, "num", "°C", "21.5 °C"],
  [3.25, "num", "$", "$3.25"],
  [12.345, "pct", "", "12.3%"],
  ["Ichiran", "text", "", "Ichiran"],
] as const)("fmt(%s, %s, %s) → %s (no currency unless the unit says so)", (v, f, unit, out) => {
  expect(fmt(v, f, unit)).toBe(out);
});
