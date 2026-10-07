import "server-only";
import { type ChoiceQuestion, QUESTIONS } from "./questions";
import type { Answer, IntentResult } from "./types";

/**
 * Jev = our composer, answered by the OpenAI Decisions API (`POST /v1/decisions`, gpt-6-luna): every
 * question in one request, each answer a choice or a probability. With no key, the offline classifier answers.
 */
const DECISIONS_URL = "https://api.openai.com/v1/decisions";
const DEFAULT_MODEL = "gpt-6-luna";
/** One attempt (warm calls take ~0.5 s; a cold first call can take longer): past this, the offline classifier answers. */
const TIMEOUT_MS = 4000;

/** A real-looking key: not empty and not a copied placeholder. */
function looksLikeKey(key: string | undefined): key is string {
  const k = key?.trim() ?? "";
  return k.length >= 12 && !/\.\.\.|your|xxx|placeholder|changeme|<|>/i.test(k);
}

function apiKey(): string | null {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return null;
  const k = process.env.OPENAI_API_KEY;
  return looksLikeKey(k) ? k.trim() : null;
}

export function jevMode(): "online" | "offline" {
  return apiKey() ? "online" : "offline";
}

type DecisionAnswer =
  | { type: "choice"; name: string; choice: string; confidence?: number; probabilities: (number | { value: string; probability: number })[] }
  | { type: "predicate"; name: string; probability: number }
  | { type: "score" | "refusal"; name: string };

const CHOICES = Object.fromEntries(QUESTIONS.filter((q): q is ChoiceQuestion => q.type === "choice").map((q) => [q.name, q.choices.map((c) => c.value)]));

/** A choice answer → our Answer. Probabilities may come as numbers aligned with our choices, or labelled. */
function choiceAnswer<T extends string>(answers: DecisionAnswer[], name: string): Answer<T> {
  const a = answers.find((x) => x.name === name);
  const options = CHOICES[name];
  if (!a || a.type !== "choice" || !options.includes(a.choice)) throw new Error(`decisions: no usable answer for ${name}`);
  const probabilities: Partial<Record<T, number>> = {};
  a.probabilities.forEach((p, i) => {
    if (typeof p === "number") {
      if (options[i]) probabilities[options[i] as T] = p;
    } else if (options.includes(p.value)) probabilities[p.value as T] = p.probability;
  });
  // The live API sends labelled probabilities and no confidence: the chosen option's probability is it.
  const confidence = a.confidence ?? probabilities[a.choice as T] ?? 0;
  if (!Object.keys(probabilities).length) probabilities[a.choice as T] = confidence;
  return { value: a.choice as T, confidence, probabilities };
}

function predicate(answers: DecisionAnswer[], name: string): number {
  const a = answers.find((x) => x.name === name);
  if (!a || a.type !== "predicate") throw new Error(`decisions: no usable answer for ${name}`);
  return a.probability;
}

export class APIUserAbortError extends Error {}

/** One call, every question in parallel. */
export async function classifyWithJev(text: string, signal?: AbortSignal, f: typeof fetch = fetch): Promise<IntentResult> {
  const key = apiKey();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.JEV_MODEL || DEFAULT_MODEL;
  const started = performance.now();
  let res: Response;
  try {
    res = await f(DECISIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input: text, questions: QUESTIONS }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (signal?.aborted) throw new APIUserAbortError("aborted");
    throw e;
  }
  const j = (await res.json().catch(() => ({}))) as { answers?: DecisionAnswer[]; error?: { message?: string } };
  if (!res.ok || !j.answers) throw new Error(`decisions ${res.status}: ${j.error?.message?.slice(0, 160) ?? "no answers"}`);
  const a = j.answers;
  return {
    shell: choiceAnswer(a, "shell"),
    shape: choiceAnswer(a, "shape"),
    vibe: choiceAnswer(a, "vibe"),
    scene: choiceAnswer(a, "scene"),
    signals: { nonsense: predicate(a, "nonsense") },
    latencyMs: Math.round(performance.now() - started),
    model,
    source: "jev",
  };
}
