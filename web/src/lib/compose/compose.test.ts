import { describe, expect, test } from "vitest";
import { draftManifest, resolveShell, topCombos } from "./compose";
import { mockClassify } from "@/lib/intent/mock";
import { parse } from "@/lib/intent/parse";

describe("resolveShell", () => {
  test("honors a named shell that accepts the shape", () => expect(resolveShell("minesweeper", "grid")).toBe("minesweeper"));
  test("falls back to the shape's default shell", () => expect(resolveShell("excel", "doc")).toBe("notepad"));
  test("unspecified uses the shape default", () => expect(resolveShell("unspecified", "table")).toBe("excel"));
});

describe("topCombos", () => {
  test("gibberish → no combos", () => expect(topCombos(mockClassify("asdfgh qwrt"), 3, "asdfgh qwrt")).toEqual([]));
  test("named program with nonsense signal still drafts (tetris)", () =>
    expect(topCombos({ ...mockClassify("tetris but about cats"), signals: { nonsense: 0.9 } }, 3, "tetris but about cats").length).toBeGreaterThan(0));
  test("best combo first", () => expect(topCombos(mockClassify("minesweeper but about cats"), 3)[0]).toMatchObject({ shell: "minesweeper", shape: "grid" }));
});

describe("draftManifest", () => {
  test("title, icon and Jev stats", () => {
    const prompt = "excel of the best ramen in tokyo";
    const m = draftManifest({ prompt, intent: { ...mockClassify(prompt), latencyMs: 412, source: "jev" }, params: parse(prompt) });
    expect(m).toMatchObject({ shell: "excel", shape: "table", icon: "excel", jevMs: 412, jevSource: "jev" });
    expect(m.title).toBe("Excel · Best ramen in tokyo");
  });
  test("picture shape without a parsed subject uses the prompt as the image", () => {
    const prompt = "mt fuji at sunset";
    const intent = mockClassify(prompt);
    const m = draftManifest({ prompt, intent: { ...intent, shape: { value: "picture", confidence: 1, probabilities: { picture: 1 } } }, params: parse(prompt) });
    expect(m.params.image).toBe("mt fuji at sunset");
  });
});
