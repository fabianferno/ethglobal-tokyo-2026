import "server-only";
import { geminiTextCost, recordSpend } from "@/lib/budget";
import type { Data } from "@/lib/kit/types";
import { ContentError, dataJsonSchema, toData } from "./data";
import { buildDataPrompt } from "./prompt";

export type GeminiCall = (p: { system: string; user: string; schema: object }) => Promise<string>;

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 20_000;

export const gemini: GeminiCall = async ({ system, user, schema }) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_CONTENT_MODEL || DEFAULT_MODEL;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = (await r.json()) as { error?: { message: string }; candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  recordSpend(geminiTextCost(j.usageMetadata?.promptTokenCount ?? 0, j.usageMetadata?.candidatesTokenCount ?? 0));
  if (!r.ok) throw new Error(`gemini ${r.status}: ${j.error?.message?.slice(0, 160)}`);
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new ContentError("gemini returned no text");
  return text;
};

const dataCache = new Map<string, Data>();
const dataInflight = new Map<string, Promise<Data>>();

/** Gemini → validated Data. One retry on a bad answer. Cached per (prompt, nonce). */
export function generateData(prompt: string, nonce: number, call: GeminiCall = gemini): Promise<Data> {
  const key = `${prompt.trim().toLowerCase()}|${nonce}`;
  const hit = dataCache.get(key);
  if (hit) return Promise.resolve(hit);
  const running = dataInflight.get(key);
  if (running) return running;
  const once = async () => {
    const { system, user } = buildDataPrompt(prompt);
    const raw = await call({ system, user, schema: dataJsonSchema() });
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ContentError("not JSON");
    }
    return toData(json);
  };
  const p = (async () => {
    let d: Data;
    try {
      d = await once();
    } catch (e) {
      if (!(e instanceof ContentError)) throw e;
      d = await once();
    }
    if (dataCache.size >= 200) dataCache.delete(dataCache.keys().next().value!);
    dataCache.set(key, d);
    return d;
  })().finally(() => dataInflight.delete(key));
  dataInflight.set(key, p);
  return p;
}
