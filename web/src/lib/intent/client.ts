import "server-only";
import { APIUserAbortError, TypeSafeClient } from "@typesafe-ai/sdk";
import { baseQuestions } from "./questions";
import type { Answer, IntentResult } from "./types";

let client: TypeSafeClient | null = null;

/** A real-looking key: not empty and not a copied placeholder. */
function looksLikeKey(key: string | undefined): key is string {
  const k = key?.trim() ?? "";
  return k.length >= 12 && !/\.\.\.|your|xxx|placeholder|changeme|<|>/i.test(k);
}

/**
 * Jev goes through Vercel AI Gateway (TypeSafe-compatible endpoint). A direct TypeSafe key
 * still works as a fallback; with neither, the offline classifier answers.
 */
const GATEWAY_URL = "https://ai-gateway.vercel.sh/typesafe";

function route(): { apiKey: string; baseURL?: string; model: string } | null {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return null;
  if (looksLikeKey(process.env.AI_GATEWAY_API_KEY)) {
    return { apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: GATEWAY_URL, model: process.env.JEV_MODEL || "typesafe-ai/jev" };
  }
  if (looksLikeKey(process.env.TYPESAFE_API_KEY)) {
    return { apiKey: process.env.TYPESAFE_API_KEY, model: process.env.JEV_MODEL || "jev-latest" };
  }
  return null;
}

export function jevMode(): "online" | "offline" {
  return route() ? "online" : "offline";
}

function getClient() {
  const r = route()!;
  client ??= new TypeSafeClient({
    apiKey: r.apiKey,
    baseURL: r.baseURL,
    defaultModel: r.model,
    // One fast attempt: a stale answer is worse than falling back to the offline classifier.
    retry: { maxRetries: 0 },
    timeout: 2500,
  });
  return client;
}

function answer<T extends string>(r: { choice: T; confidence: number; probabilities: { readonly [k in T]: number } }): Answer<T> {
  return { value: r.choice, confidence: r.confidence, probabilities: { ...r.probabilities } as Partial<Record<T, number>> };
}

/** One call, every question in parallel. */
export async function classifyWithJev(text: string, signal?: AbortSignal): Promise<IntentResult> {
  const started = performance.now();
  const res = await getClient().systemOne({ state: { text }, questions: baseQuestions }, { signal });
  const a = res.answers;
  return {
    shell: answer(a.shell),
    shape: answer(a.shape),
    vibe: answer(a.vibe),
    scene: answer(a.scene),
    signals: { nonsense: a.nonsense.noul },
    latencyMs: Math.round(performance.now() - started),
    model: res.model,
    source: "jev",
  };
}

export { APIUserAbortError };
