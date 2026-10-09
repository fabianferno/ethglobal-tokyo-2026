import { describe, expect, test, vi } from "vitest";
import { buildDataPrompt } from "./prompt";
import { type GeminiCall, generateData } from "./server";

const good = JSON.stringify({ collections: [{ name: "books", fields: [{ name: "title", type: "text", values: [] }], records: [["Dune"]] }] });

describe("buildDataPrompt", () => {
  test("states the limits and the field types; the person's words are the user turn", () => {
    const { system, user } = buildDataPrompt("reading list");
    expect(system).toMatch(/1 to 4 collections/);
    expect(system).toMatch(/up to 15/);
    expect(system).toMatch(/yesno/);
    expect(user).toBe("reading list");
  });
});

describe("generateData", () => {
  test("returns typed data", async () => {
    const d = await generateData("reading list", 0, vi.fn<GeminiCall>(async () => good));
    expect(d.collections[0].records[0].title).toBe("Dune");
  });

  test("retries once on a bad answer, then gives up", async () => {
    const once = vi.fn<GeminiCall>().mockResolvedValueOnce("{nope").mockResolvedValueOnce(good);
    await generateData("reading list", 1, once);
    expect(once).toHaveBeenCalledTimes(2);
    const bad = vi.fn<GeminiCall>(async () => JSON.stringify({ collections: [] }));
    await expect(generateData("reading list", 2, bad)).rejects.toThrow();
    expect(bad).toHaveBeenCalledTimes(2);
  });

  test("same prompt + nonce twice = one Gemini call", async () => {
    const call = vi.fn<GeminiCall>(async () => good);
    await Promise.all([generateData("x list", 3, call), generateData("x list", 3, call)]);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

test("Gemini calls record their cost from usageMetadata", async () => {
  const { resetBudget, spentToday } = await import("@/lib/budget");
  const { gemini } = await import("./server");
  resetBudget();
  vi.stubEnv("GEMINI_API_KEY", "test-key-123456");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 } }))));
  await gemini({ system: "s", user: "u", schema: {} });
  expect(spentToday()).toBeCloseTo(0.5);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
