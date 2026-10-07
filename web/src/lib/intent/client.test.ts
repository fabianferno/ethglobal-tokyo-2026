import { afterEach, describe, expect, test, vi } from "vitest";
import { classifyWithJev, jevMode } from "./client";

const ANSWERS = [
  { type: "choice", name: "shell", choice: "minesweeper", confidence: 0.91, probabilities: [0.01, 0.91, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02] },
  { type: "choice", name: "shape", choice: "grid", confidence: 0.88, probabilities: [{ value: "grid", probability: 0.88 }, { value: "list", probability: 0.12 }] },
  { type: "choice", name: "vibe", choice: "playful", confidence: 0.7, probabilities: [0.1, 0.7, 0.1, 0.05, 0.05] },
  { type: "choice", name: "scene", choice: "sparkle", confidence: 0.6, probabilities: [0.6, 0.1, 0.1, 0.05, 0.05, 0.05, 0.03, 0.02] },
  { type: "predicate", name: "nonsense", probability: 0.03 },
];

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };

afterEach(() => vi.unstubAllEnvs());

describe("Jev via the OpenAI Decisions API", () => {
  test("online only with an OpenAI key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(jevMode()).toBe("offline");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
    expect(jevMode()).toBe("online");
  });

  test("sends one request with every question to /v1/decisions on gpt-6-luna", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
    const f = ok({ answers: ANSWERS });
    await classifyWithJev("minesweeper but about cats", undefined, f);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/decisions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test-1234567890abcdef");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gpt-6-luna");
    expect(body.input).toBe("minesweeper but about cats");
    expect(body.questions.map((q: { name: string }) => q.name)).toEqual(["shell", "shape", "vibe", "scene", "nonsense"]);
    expect(body.questions[0]).toMatchObject({ type: "choice", choices: expect.arrayContaining([{ value: "excel", description: expect.any(String) }]) });
    expect(body.questions[4]).toMatchObject({ type: "predicate" });
  });

  test("maps answers into an IntentResult (numeric or labelled probabilities)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
    const r = await classifyWithJev("x", undefined, ok({ answers: ANSWERS }));
    expect(r).toMatchObject({ source: "jev", model: "gpt-6-luna", signals: { nonsense: 0.03 } });
    expect(r.shell).toMatchObject({ value: "minesweeper", confidence: 0.91 });
    expect(r.shell.probabilities.minesweeper).toBe(0.91);
    expect(r.shape.probabilities).toEqual({ grid: 0.88, list: 0.12 });
    expect(r.scene.value).toBe("sparkle");
  });

  test("confidence falls back to the chosen option's probability (the live API sends no confidence field)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
    const live = ANSWERS.map((a) => (a.type === "choice" ? { type: a.type, name: a.name, choice: a.choice, probabilities: a.name === "shape" ? a.probabilities : [{ value: a.choice, probability: 0.96 }] } : a));
    const r = await classifyWithJev("x", undefined, ok({ answers: live }));
    expect(r.shell.confidence).toBe(0.96);
    expect(r.shape.confidence).toBe(0.88);
  });

  test("an answer outside our options or a refusal is an error (route falls back offline)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
    const bad = ANSWERS.map((a) => (a.name === "shape" ? { type: "refusal", name: "shape" } : a));
    await expect(classifyWithJev("x", undefined, ok({ answers: bad }))).rejects.toThrow();
    await expect(classifyWithJev("x", undefined, ok({ error: { message: "nope" } }, 401))).rejects.toThrow(/401/);
  });
});
