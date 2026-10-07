import { describe, expect, test } from "vitest";
import { mockClassify } from "./mock";

const top = (t: string) => {
  const r = mockClassify(t);
  return { shell: r.shell.value, shape: r.shape?.value, nonsense: r.signals.nonsense };
};

describe("offline classifier", () => {
  test.each([
    ["excel of the best ramen in tokyo", "excel", "table"],
    ["minesweeper but about cats", "minesweeper", "grid"],
    ["paint but roast my week", "paint", "scene"],
    ["notepad diary of a pirate", "notepad", "doc"],
    ["weather forecast for my mood", "weather", "gauge"],
    ["3d chart of world population", "hologram", "series"],
    ["draw a picture of mt fuji", "paint", "picture"],
    ["top 10 sci-fi books", "unspecified", "list"],
  ])("%s → %s/%s", (text, shell, shape) => {
    expect(top(text)).toMatchObject({ shell, shape });
  });

  test("gibberish is nonsense", () => {
    expect(top("asdfgh qwrt").nonsense).toBeGreaterThan(0.6);
  });

  test("no money vocabulary left", () => {
    const r = mockClassify("portfolio");
    expect(Object.keys(r)).not.toContain("fn");
  });
});
