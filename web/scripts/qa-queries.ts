/**
 * Read-only QA harness: run Start-menu queries through the same pipeline the UI uses
 * (/api/intent → shortlist/best match → topCombos → draftManifest → buildBundle) against the
 * running dev server, and print what pressing Enter would open. No browser needed.
 *
 *   pnpm qa:queries "paint app with eth chart" "tetris but my portfolio"
 *   pnpm qa:queries --file queries.txt --json
 */
import { readFileSync } from "node:fs";
import { buildBundle, draftManifest, topCombos, type AppManifest } from "@/lib/compose/compose";
import { PUBLISHED, shortlist, toCandidate } from "@/lib/compose/registry";
import { detectProgram } from "@/lib/genshell/detect";
import { actionHits, BEST_MATCH, folderFor, rankPublished, showNotFound, systemHits } from "@/os/searchRank";
import { fromStored, type StoredManifest } from "@/lib/ens/manifest";
import { parse } from "@/lib/intent/parse";
import type { IntentResult } from "@/lib/intent/types";
import { isRealWallet } from "@/lib/portfolio/live";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const OWNER = "judge";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const fileIdx = args.indexOf("--file");
const queries = fileIdx >= 0 ? readFileSync(args[fileIdx + 1], "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : args.filter((a) => !a.startsWith("--"));

let folders: string[] = [];
async function publishedIndex(): Promise<AppManifest[]> {
  try {
    const j = (await (await fetch(`${BASE}/api/ens/index`)).json()) as { entries: { ens: string; kind: string; published: boolean; manifest: StoredManifest | null; aliasOf?: string }[] };
    folders = j.entries.filter((e) => e.kind === "folder" && !e.aliasOf).map((e) => e.ens);
    const live = j.entries.filter((e) => e.kind === "app" && e.manifest && e.published && !e.aliasOf).map((e) => fromStored(e.ens, e.manifest!, true));
    return live.length ? live : PUBLISHED;
  } catch {
    return PUBLISHED;
  }
}

const summarizeBundle = (b: ReturnType<typeof buildBundle>) => ({
  title: b.title,
  subtitle: b.subtitle,
  shapes: (["table", "series", "list", "grid", "gauge", "scene"] as const).filter((k) => b[k] !== undefined),
  actions: b.actions.map((a) => a.label),
});

async function run(q: string, index: AppManifest[], shells: Set<string>, folders: string[]) {
  const params = parse(q);
  const shortl = shortlist(q, index);
  const res = await fetch(`${BASE}/api/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: q, candidates: shortl.map(toCandidate) }) });
  const intent = (await res.json()) as IntentResult;

  // Same ranking code as the Start menu (src/os/searchRank.ts).
  const pub = rankPublished({ q, result: intent, params, shortlist: shortl, index, owner: OWNER });
  const folder = folderFor(params, index, folders, q);
  const systems = [...(folder ? [{ label: `Open folder ${folder}` }] : []), ...actionHits(q), ...systemHits(q)];
  const creates = topCombos(intent, 3, q).map((combo) => draftManifest({ prompt: q, intent, params, owner: OWNER, combo }));
  const best = pub[0] && pub[0].p >= BEST_MATCH ? pub[0] : null;
  const notFound = showNotFound({ q, result: intent, hasOther: systems.length + (best ? 1 : 0) + creates.length > 0, pinned: best?.p === 1, systems: systems.length });
  const opened = systems.length ? null : (best?.app ?? creates[0]);
  const program = detectProgram(q);

  return {
    query: q,
    jev: intent.source + (intent.error ? " (fell back)" : ""),
    shell: Object.entries(intent.shell.probabilities).sort((a, b) => b[1]! - a[1]!).slice(0, 2).map(([k, p]) => `${k}:${p!.toFixed(2)}`).join(" "),
    fn: Object.entries(intent.fn.probabilities).sort((a, b) => b[1]! - a[1]!).slice(0, 2).map(([k, p]) => `${k}:${p!.toFixed(2)}`).join(" "),
    nonsense: +intent.signals.nonsense.toFixed(2),
    params: { ens: params.ensNames, tokens: params.tokens, amount: params.amount, leverage: params.leverage, members: params.members, schedule: params.schedule },
    systemApp: systems[0]?.label ?? null,
    enterOpens: opened ? { kind: best ? "published best match" : "create new", ens: opened.ens, shell: opened.shell, fn: opened.fn, title: opened.title, target: opened.target, readOnly: opened.readOnly, bundle: summarizeBundle(buildBundle(opened)) } : null,
    otherCreates: creates.slice(1).map((c) => `${c.shell} × ${c.fn}`),
    notFoundShown: notFound,
    realData: opened ? isRealWallet(opened.target) && ["portfolio", "roast"].includes(opened.fn) : false,
    generatedShell: program ? { program: program.name, installed: shells.has(program.label) } : null,
  };
}

async function main() {
  if (!queries.length) throw new Error("usage: qa-queries <query…> | --file queries.txt [--json]");
  const [index, shellsJ] = await Promise.all([publishedIndex(), fetch(`${BASE}/api/shells`).then((r) => r.json()).catch(() => ({ shells: [] }))]);
  const shells = new Set<string>((shellsJ.shells ?? []).map((s: { label: string }) => s.label));
  const out = [];
  for (const q of queries) {
    try {
      out.push(await run(q, index, shells, folders));
    } catch (e) {
      out.push({ query: q, error: (e as Error).message });
    }
  }
  if (asJson) return console.log(JSON.stringify(out, null, 1));
  for (const r of out) {
    if ("error" in r) {
      console.log(`✗ ${r.query}\n   ERROR ${r.error}\n`);
      continue;
    }
    const o = r.enterOpens;
    console.log(`▶ ${r.query}`);
    console.log(`   jev=${r.jev}  shell[${r.shell}]  fn[${r.fn}]  nonsense=${r.nonsense}`);
    if (r.systemApp) console.log(`   Enter → system app: ${r.systemApp}`);
    else console.log(`   Enter → ${o ? `${o.kind}: ${o.title} (${o.shell} × ${o.fn}) ${o.ens}  target=${o.target}` : "nothing"}${r.notFoundShown ? "  [+ 'cannot find .exe' entry]" : ""}`);
    if (o) console.log(`   bundle: "${o.bundle.title}" · ${o.bundle.subtitle} · shapes=${o.bundle.shapes.join(",")} · actions=${o.bundle.actions.join("/") || "-"}`);
    if (r.realData) console.log(`   real data: yes (live portfolio for ${o?.target})`);
    if (r.generatedShell) console.log(`   generated shell: ${r.generatedShell.program} (${r.generatedShell.installed ? "installed" : "would install in tray"})`);
    if (r.otherCreates.length) console.log(`   also offered: ${r.otherCreates.join(", ")}`);
    console.log("");
  }
}

void main();
