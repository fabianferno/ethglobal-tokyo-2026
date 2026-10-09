import { afterEach, expect, test, vi } from "vitest";

const { GET } = await import("./route");
const { recordSpend, resetBudget, spentToday } = await import("@/lib/budget");
afterEach(() => (resetBudget(), vi.unstubAllGlobals(), vi.unstubAllEnvs()));
const req = (q: string) => new Request(`http://x/api/image?q=${encodeURIComponent(q)}`, { headers: { "x-real-ip": "203.0.113.50" } });
const png = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aGk=" } }] } }] }));

test("past the daily spending limit, a new picture is a 503 and Gemini isn't called", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key-123456");
  const f = vi.fn(async () => png());
  vi.stubGlobal("fetch", f);
  recordSpend(1000);
  const r = await GET(req("a brand new subject"));
  expect(r.status).toBe(503);
  expect(f).not.toHaveBeenCalled();
});

test("each generated picture records its cost", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key-123456");
  vi.stubGlobal("fetch", vi.fn(async () => png()));
  resetBudget();
  expect((await GET(req("mt fuji at dawn"))).status).toBe(200);
  expect(spentToday()).toBeCloseTo(0.04);
});
