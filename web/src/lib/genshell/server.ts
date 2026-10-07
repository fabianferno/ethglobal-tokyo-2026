import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { exeName, shellLabel } from "./detect";
import { systemPrompt, userPrompt } from "./prompt";
import type { ShellInfo } from "./types";

/**
 * Generated shells: an LLM writes a new renderer once ("TETRIS.EXE"), a browser smoke-tests it in the
 * sandbox, then it's installed on this server and every later "tetris but …" is instant for everyone.
 *
 * Cache: web/.genshells/v2/<label>.json (gitignored; v2 = the jev.* bridge, older files are ignored).
 * Falls back to memory where the fs is read-only.
 */

/** Tried in order; a model the gateway key can't use (e.g. free tier) falls through to the next. */
const MODELS = (process.env.GENSHELL_MODELS || "anthropic/claude-sonnet-5,openai/gpt-5").split(",").map((m) => m.trim()).filter(Boolean);
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const DIR = path.join(process.cwd(), ".genshells", "v2");
const MAX_BYTES = 60_000;

type Record_ = ShellInfo & { html: string };
const mem = new Map<string, Record_>();

/** A record without its (large) HTML. */
function infoOf(r: Record_): ShellInfo {
  const { html, ...info } = r;
  void html;
  return info;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hasGenerator = () => !!process.env.AI_GATEWAY_API_KEY;

/* ── Local cache ── */

async function save(r: Record_) {
  mem.set(r.label, r);
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, `${r.label}.json`), JSON.stringify(r));
  } catch {
    /* read-only fs (serverless): memory only */
  }
}

async function loadLocal(label: string): Promise<Record_ | null> {
  if (mem.has(label)) return mem.get(label)!;
  try {
    const r = JSON.parse(await readFile(path.join(DIR, `${label}.json`), "utf8")) as Record_;
    mem.set(label, r);
    return r;
  } catch {
    return null;
  }
}

async function listLocal(): Promise<ShellInfo[]> {
  try {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".json"));
    for (const f of files) await loadLocal(f.slice(0, -5));
  } catch {
    /* no dir yet */
  }
  return [...mem.values()].map(infoOf);
}

/** Every installed shell on this server. */
export async function listShells(): Promise<ShellInfo[]> {
  // Only shells that passed the browser smoke test count as installed (`published`); an install that
  // was interrupted mid-test stays invisible until someone finishes it.
  return (await listLocal()).filter((x) => x.published);
}

/** The HTML for a shell, from this server's cache. */
export async function shellHtml(label: string): Promise<string | null> {
  return (await loadLocal(label))?.html ?? null;
}

/* ── Generate ── */

/** Defense in depth: the sandbox + CSP already block all of this; failing early gives the model a clear retry. */
const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, "fetch()"],
  [/XMLHttpRequest|WebSocket|EventSource|sendBeacon/, "network APIs"],
  [/\bimport\s*\(|<script[^>]*\bsrc\s*=|<link\b|@import/i, "external resources"],
  [/localStorage|sessionStorage|indexedDB|document\.cookie/, "storage"],
  [/\beval\s*\(|new\s+Function\s*\(/, "eval"],
  [/\bwindow\.(?:parent|top|opener)\b|\bparent\.postMessage|\btop\.location/, "parent/top access"],
  // The sandbox still lets a frame navigate itself: a page loaded that way has no CSP and could leak the prompt.
  [/\blocation\s*\.\s*(?:href|assign|replace)\b|\blocation\s*=|http-equiv\s*=\s*["']?refresh|\bdocument\.write\s*\(/i, "navigation"],
  [/<a\b[^>]*\bhref\s*=|<form\b|\bwindow\.open\s*\(/i, "links"],
];

export function checkHtml(html: string): string | null {
  if (html.length > MAX_BYTES) return `too large (${html.length} bytes, max ${MAX_BYTES})`;
  if (!/jev\.onData\s*\(/.test(html)) return "never calls jev.onData";
  if (!/jev\.ready\s*\(/.test(html)) return "never calls jev.ready";
  for (const [re, what] of FORBIDDEN) if (re.test(html)) return `uses ${what}`;
  return null;
}

function extractHtml(text: string) {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).replace(/<\/?(?:html|head|body)[^>]*>/gi, "").trim();
}

type Msg = { role: "system" | "user"; content: string };

async function complete(messages: Msg[]): Promise<{ model: string; content: string }> {
  let last = "no generator model configured";
  for (const model of MODELS) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` },
      // Reasoning models spend part of the budget thinking, so leave plenty of room for the program.
      body: JSON.stringify({ model, max_tokens: 32000, messages }),
      signal: AbortSignal.timeout(280_000),
    });
    const j = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (res.ok) return { model, content: j.choices?.[0]?.message?.content ?? "" };
    last = j.error?.message ?? `generator ${res.status}`;
    // Access/tier/unknown-model errors → try the next model; anything else is a real failure.
    if (![400, 401, 402, 403, 404].includes(res.status) && !/tier|access|not found|credits/i.test(last)) break;
    console.warn(`[genshell] ${model} unavailable: ${last.slice(0, 120)}`);
  }
  throw new Error(last);
}

const inflight = new Map<string, Promise<ShellInfo>>();

export function generateShell(opts: { name: string; prompt: string; sample: unknown; installedBy: string; retryError?: string }): Promise<ShellInfo> {
  const label = shellLabel(opts.name);
  const running = inflight.get(label);
  if (running) return running;
  const p = (async () => {
    // An earlier install was interrupted before its smoke test: test that code instead of paying for a new generation.
    const cached = opts.retryError ? null : await loadLocal(label);
    if (cached) return infoOf(cached);
    const t0 = Date.now();
    const { model, content } = await complete([
      { role: "system", content: systemPrompt() },
      { role: "user", content: userPrompt(opts) },
    ]);
    const html = extractHtml(content);
    const bad = checkHtml(html);
    if (bad) throw Object.assign(new Error(`generated shell ${bad}`), { check: bad });
    const rec: Record_ = {
      label,
      name: opts.name,
      exe: exeName(opts.name),
      sha256: sha256(html),
      bytes: html.length,
      model,
      createdAt: Date.now(),
      installedBy: opts.installedBy.slice(0, 80),
      published: false,
      html,
    };
    await save(rec);
    console.info(`[genshell] ${rec.exe} generated by ${model} in ${Math.round((Date.now() - t0) / 1000)}s (${rec.bytes} bytes)`);
    return infoOf(rec);
  })().finally(() => inflight.delete(label));
  inflight.set(label, p);
  return p;
}

/* ── Install (after the browser smoke test passed) ── */

const publishing = new Map<string, Promise<ShellInfo>>();

/** Why this build may not be published (null = OK): it must exist here, match the tested hash, and pass the static checks. */
export async function canPublish(label: string, sha: string): Promise<string | null> {
  const rec = await loadLocal(label);
  if (!rec) return `no shell ${label} on this server`;
  if (rec.sha256 !== sha) return "that build isn't the one on this server (hash mismatch)";
  return checkHtml(rec.html);
}

/** Passed the smoke test → installed for everyone on this server. */
export function publishShell(label: string): Promise<ShellInfo> {
  const running = publishing.get(label);
  if (running) return running;
  const p = (async () => {
    const rec = await loadLocal(label);
    if (!rec) throw new Error(`no shell ${label}`);
    const done: Record_ = { ...rec, published: true };
    await save(done);
    console.info(`[genshell] ${rec.exe} installed`);
    return infoOf(done);
  })().finally(() => publishing.delete(label));
  publishing.set(label, p);
  return p;
}
