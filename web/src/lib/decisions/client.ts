import "server-only";
import { decisionsCost, recordSpend } from "@/lib/budget";
import type { DecisionAnswer, Question } from "./types";

const DECISIONS_URL = "https://api.openai.com/v1/decisions";
const TIMEOUT_MS = 4000;
export const DECISIONS_MODEL = () => process.env.JEV_MODEL || "gpt-6-luna";

function looksLikeKey(key: string | undefined): key is string {
  const k = key?.trim() ?? "";
  return k.length >= 12 && !/\.\.\.|your|xxx|placeholder|changeme|<|>/i.test(k);
}
function apiKey(): string | null {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return null;
  const k = process.env.OPENAI_API_KEY;
  return looksLikeKey(k) ? k.trim() : null;
}
export const decisionsMode = (): "online" | "offline" => (apiKey() ? "online" : "offline");

/** One Decisions call: every question answered in parallel against the same input. */
export async function decide(input: string, questions: Question[], signal?: AbortSignal, f: typeof fetch = fetch): Promise<DecisionAnswer[]> {
  const key = apiKey();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await f(DECISIONS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: DECISIONS_MODEL(), input, questions }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = (await res.json().catch(() => ({}))) as { answers?: DecisionAnswer[]; error?: { message?: string }; usage?: { input_tokens?: number } };
  recordSpend(decisionsCost(j.usage?.input_tokens ?? 0));
  if (!res.ok || !j.answers) throw new Error(`decisions ${res.status}: ${j.error?.message?.slice(0, 160) ?? "no answers"}`);
  return j.answers;
}
