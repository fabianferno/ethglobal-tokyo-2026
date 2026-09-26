import "server-only";
import { APIUserAbortError, TypeSafeClient } from "@typesafe-ai/sdk";
import { baseQuestions, matchQuestions } from "./questions";
import type { Answer, Candidate, IntentResult } from "./types";

let client: TypeSafeClient | null = null;

/** A real-looking key: not empty and not a copied placeholder. */
function looksLikeKey(key: string | undefined): key is string {
  const k = key?.trim() ?? "";
  return k.length >= 12 && !/\.\.\.|your|xxx|placeholder|changeme|<|>/i.test(k);
}

export function jevMode(): "online" | "offline" {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return "offline";
  return looksLikeKey(process.env.TYPESAFE_API_KEY) ? "online" : "offline";
}

function getClient() {
  client ??= new TypeSafeClient({
    defaultModel: process.env.JEV_MODEL || "jev-latest",
    // One fast attempt: a stale answer is worse than falling back to the offline classifier.
    retry: { maxRetries: 0 },
    timeout: 2500,
  });
  return client;
}

function answer<T extends string>(r: { choice: T; confidence: number; probabilities: { readonly [k in T]: number } }): Answer<T> {
  return { value: r.choice, confidence: r.confidence, probabilities: { ...r.probabilities } as Partial<Record<T, number>> };
}

/** One call, every question in parallel — including one yes/no per published-app candidate. */
export async function classifyWithJev(text: string, candidates: Candidate[], signal?: AbortSignal): Promise<IntentResult> {
  const started = performance.now();
  const res = await getClient().systemOne(
    { state: { text }, questions: { ...baseQuestions, ...matchQuestions(candidates) } },
    { signal },
  );
  const a = res.answers;
  const matches: Record<string, number> = {};
  candidates.forEach((c, i) => {
    const m = (a as Record<string, unknown>)[`m${i}`] as { noul: number } | undefined;
    if (m) matches[c.id] = m.noul;
  });

  return {
    shell: answer(a.shell),
    fn: answer(a.fn),
    vibe: answer(a.vibe),
    scene: answer(a.scene),
    signals: { readOnly: a.readOnly.noul, recurring: a.recurring.noul, nonsense: a.nonsense.noul, risk: a.risk.score },
    matches,
    latencyMs: Math.round(performance.now() - started),
    model: res.model,
    source: "jev",
  };
}

export { APIUserAbortError };
