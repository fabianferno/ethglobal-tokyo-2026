import { afterEach, expect, test, vi } from "vitest";
import { decide, decisionsMode } from "./client";

afterEach(() => vi.unstubAllEnvs());
const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };
const q = { type: "predicate" as const, name: "nonsense", instructions: "gibberish?" };

test("online only with a key", () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(decisionsMode()).toBe("offline");
  vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
  expect(decisionsMode()).toBe("online");
});

test("posts the questions and returns the answers", async () => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
  const f = ok({ answers: [{ type: "predicate", name: "nonsense", probability: 0.1 }] });
  const a = await decide("hello", [q], undefined, f);
  const [url, init] = f.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/decisions");
  expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-6-luna", input: "hello", questions: [q] });
  expect(a[0]).toMatchObject({ name: "nonsense", probability: 0.1 });
});

test("errors carry the status", async () => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
  await expect(decide("x", [q], undefined, ok({ error: { message: "bad" } }, 401))).rejects.toThrow(/401/);
});

test("each call records its cost from the usage the API returns", async () => {
  const { resetBudget, spentToday } = await import("@/lib/budget");
  resetBudget();
  vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
  await decide("x", [q], undefined, ok({ answers: [], usage: { input_tokens: 2_000_000 } }));
  expect(spentToday()).toBeCloseTo(0.2);
});
