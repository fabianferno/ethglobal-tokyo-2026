import "server-only";
import type { Bundle } from "@/lib/compose/shapes";
import { buildDataPrompt, buildPrompt, type ContentRequest } from "./prompt";
import { ContentError, jsonSchemaFor, toBundle } from "./schema";
import { dataJsonSchema, toData } from "./data";
import type { Data } from "@/lib/kit/types";

export type { ContentRequest };
export type GeminiCall = (p: { system: string; user: string; schema: object }) => Promise<string>;

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 20_000;
const CACHE_MAX = 200;

const cache = new Map<string, Bundle>();
const inflight = new Map<string, Promise<Bundle>>();
const cacheKey = (r: ContentRequest) => [r.prompt.trim().toLowerCase(), r.shell, r.shape, r.vibe, r.nonce].join("|");

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
  const j = (await r.json()) as { error?: { message: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] };
  if (!r.ok) throw new Error(`gemini ${r.status}: ${j.error?.message?.slice(0, 160)}`);
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new ContentError("gemini returned no text");
  return text;
};

async function once(req: ContentRequest, call: GeminiCall): Promise<Bundle> {
  const { system, user } = buildPrompt(req);
  const raw = await call({ system, user, schema: jsonSchemaFor(req.shape) });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ContentError("not JSON");
  }
  return toBundle(req.shape, json);
}

/** Gemini → validated bundle. One retry on a bad answer. Cached and de-duplicated per request. */
export function generateContent(req: ContentRequest, call: GeminiCall = gemini): Promise<Bundle> {
  const key = cacheKey(req);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    let b: Bundle;
    try {
      b = await once(req, call);
    } catch (e) {
      if (!(e instanceof ContentError)) throw e;
      b = await once(req, call);
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, b);
    return b;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

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
