import { expect, test, vi } from "vitest";

const generateData = vi.fn();
vi.mock("@/lib/content/server", () => ({ generateData: (...a: unknown[]) => generateData(...a) }));
const { POST } = await import("./route");
const { recordSpend, resetBudget } = await import("@/lib/budget");

const req = (prompt: string, ip = "192.0.2.1") => new Request("http://x/api/content", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ prompt }) });

test("past the daily spending limit: 503 with a plain sentence, Gemini not called", async () => {
  resetBudget();
  recordSpend(1000);
  const r = await POST(req("reading list"));
  expect(r.status).toBe(503);
  expect((await r.json()).error).toMatch(/spending limit/);
  expect(generateData).not.toHaveBeenCalled();
  resetBudget();
});

test("the global hourly cap applies across all visitors", async () => {
  vi.stubEnv("GLOBAL_CONTENT_PER_HOUR", "2");
  generateData.mockResolvedValue({ collections: [] });
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await POST(req("reading list", `198.51.100.${i}`))).status);
  expect(statuses).toEqual([200, 200, 503]);
  vi.unstubAllEnvs();
});
