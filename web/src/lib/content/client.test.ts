import { expect, test, vi } from "vitest";
import { fetchContent } from "./client";
import type { AppManifest } from "@/lib/compose/compose";

const app = { prompt: "cats", shell: "excel", shape: "table", vibe: "playful" } as AppManifest;
const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("dedupes the same app + nonce", async () => {
  const f = ok({ bundle: { title: "t", subtitle: "s", actions: [] } });
  await Promise.all([fetchContent(app, 0, f), fetchContent(app, 0, f)]);
  expect(f).toHaveBeenCalledTimes(1);
});

test("a new nonce refetches", async () => {
  const f = ok({ bundle: { title: "t", subtitle: "s", actions: [] } });
  await fetchContent(app, 10, f);
  await fetchContent(app, 11, f);
  expect(f).toHaveBeenCalledTimes(2);
});

test("server error rejects with its message and is not cached", async () => {
  const bad = ok({ error: "Couldn't write this one." }, 502);
  await expect(fetchContent(app, 20, bad)).rejects.toThrow("Couldn't write this one.");
  const good = ok({ bundle: { title: "t", subtitle: "s", actions: [] } });
  await fetchContent(app, 20, good);
  expect(good).toHaveBeenCalledTimes(1);
});

test.each([
  [429, { error: "rate limited — retry in 12s" }, "Too many apps at once. Wait a few seconds and try again."],
  [400, { error: "Expected { prompt, shell, shape, vibe, nonce? }" }, "That prompt can't be turned into an app."],
  [502, { error: "Couldn't write this one." }, "Couldn't write this one."],
])("HTTP %i shows people a plain sentence", async (status, body, shown) => {
  await expect(fetchContent(app, 100 + status, ok(body, status))).rejects.toThrow(shown);
});

test("a timeout or dropped connection shows a plain sentence", async () => {
  const boom = vi.fn(async () => {
    throw new DOMException("signal timed out", "TimeoutError");
  }) as unknown as typeof fetch;
  await expect(fetchContent(app, 900, boom)).rejects.toThrow("Gemini took too long. Try again.");
});
