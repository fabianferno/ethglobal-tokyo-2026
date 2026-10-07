import { expect, test, vi } from "vitest";

vi.mock("@/lib/intent/client", async () => {
  const { noneResult } = await import("@/lib/intent/types");
  return {
    APIUserAbortError: class extends Error {},
    jevMode: () => "online",
    classifyWithJev: async () => noneResult({ source: "jev", model: "gpt-6-luna", signals: { nonsense: 0 } }),
  };
});

const { POST } = await import("./route");
const call = (text: string) =>
  POST(new Request("http://x/api/intent", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9" }, body: JSON.stringify({ text }) })).then((r) => r.json());

test("each client gets a bounded number of paid Jev calls per minute, then the offline classifier", async () => {
  const sources: string[] = [];
  for (let i = 0; i < 130; i++) sources.push((await call(`unique prompt number ${i}`)).source);
  expect(sources.slice(0, 100).every((s) => s === "jev")).toBe(true);
  expect(sources.at(-1)).toBe("mock");
});
