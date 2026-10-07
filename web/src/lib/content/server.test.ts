import { describe, expect, test, vi } from "vitest";
import { buildPrompt } from "./prompt";
import { generateContent, type GeminiCall } from "./server";

const req = { prompt: "excel of the best ramen in tokyo", shell: "excel", shape: "table", vibe: "playful", nonce: 0 } as const;
const good = JSON.stringify({ title: "Ramen", subtitle: "Tokyo", columns: [{ label: "Shop", fmt: "text", unit: "" }], rows: [["Ichiran"]] });

describe("buildPrompt", () => {
  test("names the program, shape, tone and caps", () => {
    const { system, user } = buildPrompt(req);
    expect(system).toMatch(/Excel/);
    expect(system).toMatch(/table/);
    expect(system).toMatch(/playful/);
    expect(system).toMatch(/12 rows/);
    expect(user).toBe(req.prompt);
  });

  test("keeps the OS out of the content", () => {
    expect(buildPrompt(req).system).toMatch(/Do not mention Windows, Jev OS or computers/);
  });
});

describe("generateContent", () => {
  test("returns a bundle", async () => {
    const call: GeminiCall = vi.fn(async () => good);
    const b = await generateContent(req, call);
    expect(b.table!.rows[0]).toEqual({ c0: "Ichiran" });
  });

  test("retries once on invalid JSON, then succeeds", async () => {
    const call = vi.fn<GeminiCall>().mockResolvedValueOnce("{not json").mockResolvedValueOnce(good);
    await generateContent({ ...req, nonce: 1 }, call);
    expect(call).toHaveBeenCalledTimes(2);
  });

  test("gives up after two bad answers", async () => {
    const call = vi.fn<GeminiCall>(async () => JSON.stringify({ title: "x" }));
    await expect(generateContent({ ...req, nonce: 2 }, call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2);
  });

  test("same request twice = one call (cache + in-flight dedupe)", async () => {
    const call = vi.fn<GeminiCall>(async () => good);
    await Promise.all([generateContent({ ...req, nonce: 3 }, call), generateContent({ ...req, nonce: 3 }, call)]);
    await generateContent({ ...req, nonce: 3 }, call);
    expect(call).toHaveBeenCalledTimes(1);
  });

  test("failed generations are not cached", async () => {
    const bad = vi.fn<GeminiCall>(async () => "nope");
    await expect(generateContent({ ...req, nonce: 4 }, bad)).rejects.toThrow();
    const ok = vi.fn<GeminiCall>(async () => good);
    await generateContent({ ...req, nonce: 4 }, ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
