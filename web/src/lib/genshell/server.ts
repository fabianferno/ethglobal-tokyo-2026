import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isFree, listAll, mintApp, mintFolder, ROOT } from "@/lib/ens/onchain";
import { hasServerWallet, publicClient } from "@/lib/ens/wallet";
import { exeName, shellLabel } from "./detect";
import { systemPrompt, userPrompt } from "./prompt";
import type { ShellInfo, ShellPointer } from "./types";

/**
 * Generated shells: an LLM writes a new renderer once ("TETRIS.EXE"), a browser smoke-tests it in the
 * sandbox, then it's published — HTML on Walrus, pointer + sha256 on ENS at <label>.shells.suica.eth —
 * and every later "tetris but …" is instant for everyone.
 *
 * Local cache: web/.genshells/<label>.json (gitignored). Falls back to memory where the fs is read-only.
 */

/** Tried in order; a model the gateway key can't use (e.g. free tier) falls through to the next. */
const MODELS = (process.env.GENSHELL_MODELS || "anthropic/claude-sonnet-5,openai/gpt-5").split(",").map((m) => m.trim()).filter(Boolean);
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER_URL || "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || "https://aggregator.walrus-testnet.walrus.space";
export const SHELLS_FOLDER = `shells.${ROOT}`;
const DIR = path.join(process.cwd(), ".genshells");
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

/* ── Chain: <label>.shells.suica.eth ── */

const TEXT_SHELL = "suica.shell";

async function chainShells(): Promise<ShellInfo[]> {
  if (!hasServerWallet() && !process.env.SEPOLIA_RPC_URL) return [];
  const entries = (await listAll()).filter((e) => e.parent === SHELLS_FOLDER && !e.aliasOf);
  const out = await Promise.all(
    entries.map(async (e): Promise<ShellInfo | null> => {
      const raw = await publicClient.getEnsText({ name: e.ens, key: TEXT_SHELL }).catch(() => null);
      if (!raw) return null;
      try {
        const p = JSON.parse(raw) as ShellPointer;
        const label = e.ens.slice(0, e.ens.indexOf("."));
        return { label, name: p.name, exe: exeName(p.name), sha256: p.sha256, bytes: p.bytes, model: "", createdAt: 0, installedBy: p.by, published: true, blobId: p.blobId, ens: e.ens };
      } catch {
        return null;
      }
    }),
  );
  return out.filter((x): x is ShellInfo => x !== null);
}

/** Everything installed: this server's cache + every shell published on ENS by anyone. */
export async function listShells(): Promise<ShellInfo[]> {
  // Only shells that passed the browser smoke test count as installed (`published`); an install that
  // was interrupted mid-test stays invisible until someone finishes it.
  const local = (await listLocal()).filter((s) => s.published);
  const chain = await chainShells().catch(() => []);
  const byLabel = new Map<string, ShellInfo>();
  for (const s of local) byLabel.set(s.label, s);
  // First come, first served: the one on ENS is canonical.
  for (const s of chain) byLabel.set(s.label, s);
  return [...byLabel.values()];
}

/** The HTML for a shell: local cache, else Walrus via its ENS pointer (hash-checked). */
export async function shellHtml(label: string): Promise<string | null> {
  const local = await loadLocal(label);
  if (local) return local.html;
  const info = (await chainShells().catch(() => [])).find((s) => s.label === label);
  if (!info?.blobId) return null;
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(info.blobId)}`);
  if (!res.ok) return null;
  const html = await res.text();
  if (sha256(html) !== info.sha256) throw new Error(`${info.ens}: Walrus blob doesn't match the sha256 on ENS — refusing to run it`);
  await save({ ...info, html });
  return html;
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
];

export function checkHtml(html: string): string | null {
  if (html.length > MAX_BYTES) return `too large (${html.length} bytes, max ${MAX_BYTES})`;
  if (!/suica\.onData\s*\(/.test(html)) return "never calls suica.onData";
  if (!/suica\.ready\s*\(/.test(html)) return "never calls suica.ready";
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

/* ── Publish (after the browser smoke test passed) ── */

async function uploadWalrus(html: string): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=10`, { method: "PUT", body: html });
  const j = (await res.json()) as { newlyCreated?: { blobObject: { blobId: string } }; alreadyCertified?: { blobId: string } };
  const id = j.newlyCreated?.blobObject.blobId ?? j.alreadyCertified?.blobId;
  if (!res.ok || !id) throw new Error(`walrus upload failed (${res.status})`);
  return id;
}

let folderReady: Promise<void> | null = null;
function ensureFolder() {
  // System-owned on purpose: no owner, so the server can keep updating shell records.
  folderReady ??= (async () => {
    if (await isFree("shells", ROOT)) {
      const { ens } = await mintFolder({ label: "shells", description: "Suica OS generated shells — one per program, reusable by every app" });
      if (ens !== SHELLS_FOLDER) throw new Error(`expected ${SHELLS_FOLDER}, got ${ens}`);
    }
  })().catch((e) => {
    folderReady = null;
    throw e;
  });
  return folderReady;
}

const publishing = new Map<string, Promise<ShellInfo>>();

/** Why this build may not be published (null = OK): it must exist here, match the tested hash, and pass the static checks. */
export async function canPublish(label: string, sha: string): Promise<string | null> {
  const rec = await loadLocal(label);
  if (!rec) return `no shell ${label} on this server`;
  if (rec.sha256 !== sha) return "that build isn't the one on this server (hash mismatch)";
  return checkHtml(rec.html);
}

/** Walrus upload + ENS mint. Slow (~30–60 s); callers run it in the background. */
export function publishShell(label: string): Promise<ShellInfo> {
  const running = publishing.get(label);
  if (running) return running;
  const p = (async () => {
    const rec = await loadLocal(label);
    if (!rec) throw new Error(`no shell ${label}`);
    if (rec.published && rec.ens) return infoOf(rec);
    // Passed the smoke test → installed for everyone on this server right away; Walrus + ENS follow.
    await save({ ...rec, published: true });
    const blobId = rec.blobId ?? (await uploadWalrus(rec.html));
    await save({ ...rec, published: true, blobId });
    let ens = rec.ens;
    if (!ens && hasServerWallet()) {
      await ensureFolder();
      // First come, first served: if someone already published this program, theirs stays canonical.
      if (await isFree(label, SHELLS_FOLDER)) {
        const pointer: ShellPointer = { v: 1, name: rec.name, blobId, sha256: rec.sha256, bytes: rec.bytes, by: rec.installedBy };
        const minted = await mintApp({
          label,
          parent: SHELLS_FOLDER,
          published: false,
          manifest: { v: 1, title: rec.exe, icon: "document", shell: "explorer", fn: "none", vibe: "playful", scene: "none", prompt: rec.name, params: {}, readOnly: true, target: "", owner: rec.installedBy, description: `Generated shell ${rec.exe}` },
          extraTexts: { [TEXT_SHELL]: JSON.stringify(pointer) },
        });
        ens = minted.ens;
      } else ens = `${label}.${SHELLS_FOLDER}`;
    }
    const done: Record_ = { ...rec, blobId, ens, published: true };
    await save(done);
    console.info(`[genshell] ${rec.exe} published → walrus ${blobId}${ens ? ` · ${ens}` : ""}`);
    return infoOf(done);
  })().finally(() => publishing.delete(label));
  publishing.set(label, p);
  return p;
}
