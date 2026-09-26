import type { AppManifest } from "@/lib/compose/compose";
import { detectProgram } from "@/lib/genshell/detect";
import type { Params } from "@/lib/intent/parse";
import type { IntentResult } from "@/lib/intent/types";
import type { SystemKey } from "./store";

/**
 * Start-menu ranking rules that sit on top of Jev's answers: which published app is the Best Match,
 * which system apps a query names, and when to show "cannot find .exe". Pure, so the QA harness
 * (scripts/qa-queries.ts) ranks exactly like the UI.
 */

export const BEST_MATCH = 0.6;
const SHORTLIST_FLOOR = 0.35;

/** Functions whose app is ABOUT a target wallet: a different target means a different app. */
const TARGETED_FNS = new Set(["portfolio", "roast", "journal", "perps", "loan_guard", "stake", "yield", "lp", "dca", "price_chart"]);

const SYSTEM_ROUTES: { re: RegExp; key: SystemKey; label: string }[] = [
  { re: /\b(network neighbou?rhood|published apps|browse apps|all apps|app store|other people'?s apps|apps by|show folders|list folders|workspaces|subnames|under suica\.eth|suica\.eth apps|apps (on|under|in) suica(\.eth)?|search apps|find apps)\b/, key: "network", label: "Network Neighborhood" },
  { re: /\b(task manager|taskmgr|running agents|what are my agents doing|processes)\b/, key: "taskmgr", label: "Task Manager" },
  { re: /\b(my computer|drives|my agents'? wallets)\b/, key: "mycomputer", label: "My Computer" },
  { re: /\b(recycle bin|trash|deleted apps)\b/, key: "recycle", label: "Recycle Bin" },
  { re: /\b(ui kit|design system)\b/, key: "kit", label: "Windows 98 UI Kit" },
];

/** OS actions reachable from search (not apps): "create a folder team" → the New Folder dialog. */
export type ActionKey = "newfolder" | "username" | "share" | "folder" | "welcome";
const ACTION_ROUTES: { re: RegExp; key: ActionKey; label: string }[] = [
  { re: /\b(what is (this|suica( os)?)|how does (this|it|suica( os)?) work|how do i use (this|it)|welcome|tour|about suica|getting started|get started)\b/, key: "welcome", label: "Welcome to Suica OS" },
  { re: /\b(create|new|make|add)\s+(an?\s+)?(folder|workspace)\b/, key: "newfolder", label: "New Folder (workspace)…" },
  { re: /\b(my username|register (my )?username|claim (my )?username|set my username|users\.suica\.eth|what'?s my (ens )?name)\b/, key: "username", label: "Your username" },
  { re: /\b(share (this |my )?(app|folder|workspace)?\s*with|give \S+ access|add \S+ as (a )?(member|manager)|invite \S+ to|revoke \S+)\b/, key: "share", label: "Share a folder…" },
];

/** "invite bob.eth to my club" is a club app, not folder sharing: a named app kind wins over the share route. */
const APP_WORDS = /\b(club|circle|tanomoshi|tab|split|savings|rsvp|event|party|bounty|escrow|subscription)\b/;

export function actionHits(q: string): { key: ActionKey; label: string }[] {
  const t = q.toLowerCase();
  return ACTION_ROUTES.filter((r) => r.re.test(t) && !(r.key === "share" && APP_WORDS.test(t))).map(({ key, label }) => ({ key, label }));
}

export function systemHits(q: string): { key: SystemKey; label: string }[] {
  const t = q.toLowerCase();
  return SYSTEM_ROUTES.filter((r) => r.re.test(t)).map(({ key, label }) => ({ key, label }));
}

/** Whose data the query is about: a named wallet (ENS / 0x), "me", or nobody in particular. */
function queryTarget(q: string, params: Params, owner: string): string | null {
  const named = params.ensNames.find((n) => !n.endsWith(".suica.eth"));
  if (named) return named;
  const hex = q.match(/\b0x[0-9a-fA-F]{40}\b/)?.[0];
  if (hex) return hex;
  return params.mine ? owner : null;
}

const SHELL_WORDS: [RegExp, string][] = [
  [/\b(excel|spreadsheet)\b/, "excel"],
  [/\bminesweeper\b/, "minesweeper"],
  [/\bdoom\b/, "doom"],
  [/\b(ms )?paint\b/, "paint"],
  [/\bweather\b/, "weather"],
  [/\bnotepad\b/, "notepad"],
  [/\b(file )?explorer\b/, "explorer"],
  [/\b(3d|hologram)\b/, "hologram"],
];

export type Ranked = { app: AppManifest; p: number; pinned?: boolean };

export function rankPublished(opts: { q: string; result: IntentResult; params: Params; shortlist: AppManifest[]; index: AppManifest[]; owner: string; canonical?: (ens: string) => string; all?: AppManifest[] }): Ranked[] {
  const { q, result, params, shortlist, index, owner } = opts;
  // An app's old name (it moved into a folder) is an ENSv2 alias: follow it to where the app lives now.
  const canon = opts.canonical ?? ((e: string) => e);
  const target = queryTarget(q, params, owner);
  // Jev (or the offline classifier) is confident the person named a specific shell.
  const [namedShell, shellP] = Object.entries(result.shell.probabilities).sort((a, b) => b[1]! - a[1]!)[0] ?? ["unspecified", 0];
  // A shell typed out literally ("explorer but …") counts even when the classifier is unsure.
  const program = detectProgram(q);
  const explicitShell = SHELL_WORDS.find(([re]) => re.test(q.toLowerCase()))?.[1] ?? null;
  const [namedFn, fnP] = Object.entries(result.fn.probabilities).sort((a, b) => b[1]! - a[1]!)[0] ?? ["none", 0];

  const score = (app: AppManifest) => {
    let p = result.matches[app.id] ?? 0;
    // A published app about someone else's wallet never wins a query about a different wallet.
    if (target && (app.readOnly || TARGETED_FNS.has(app.fn)) && app.target !== target) p *= 0.2;
    // "doom but roast my portfolio" shouldn't open the Paint roast.
    const askedShell = explicitShell ?? (namedShell !== "unspecified" && (shellP ?? 0) >= 0.5 ? namedShell : null);
    if (askedShell && app.shell !== askedShell) p *= 0.4;
    // "tamagotchi but my savings circle" asks for a program no published app runs: make it, don't open someone's.
    if (program) p *= 0.4;
    // …nor should "roast vitalik.eth" open the vitalik.eth spreadsheet.
    if (namedFn !== "none" && (fnP ?? 0) >= 0.5 && app.fn !== namedFn) p *= 0.4;
    return p;
  };

  // "open grouptab.suica.eth": a name that's in the index is the answer, whatever the verbs around it.
  const exact = [...new Set(params.ensNames.filter((n) => n.endsWith(".suica.eth")).map(canon))].flatMap((n) => (opts.all ?? index).filter((a) => a.ens === n)).slice(0, 1);
  const pinned: Ranked[] = exact.map((app) => ({ app, p: 1, pinned: true }));

  const rest = shortlist
    .filter((app) => !exact.some((e) => e.ens === app.ens))
    .map((app) => ({ app, p: score(app) }))
    .filter((e) => e.p >= SHORTLIST_FLOOR)
    .sort((a, b) => b.p - a.p);
  return [...pinned, ...rest].slice(0, 4);
}

/**
 * "tab.shibuya-cafe.suica.eth" when that app doesn't exist: open the nearest folder that does
 * (shibuya-cafe.suica.eth), rather than drafting an unrelated new app from the words.
 */
export function folderFor(params: Params, index: AppManifest[], folders: string[], q = "", canonical: (ens: string) => string = (e) => e): string | null {
  for (const name of params.ensNames.filter((n) => n.endsWith(".suica.eth"))) {
    if (index.some((a) => a.ens === name || a.ens === canonical(name))) continue;
    for (let at = name; at.split(".").length > 2; at = at.slice(at.indexOf(".") + 1)) if (folders.includes(at)) return at;
  }
  // "open the shibuya cafe tab": every word of a multi-word folder label, plus an open/go verb.
  const t = q.toLowerCase();
  if (!/\b(open|go to|show|take me to|visit)\b/.test(t)) return null;
  const words = new Set(t.split(/[^a-z0-9]+/));
  const hit = folders
    .map((f) => ({ f, parts: f.slice(0, f.indexOf(".")).split("-") }))
    .filter(({ parts }) => parts.length > 1 && parts.every((w) => words.has(w)))
    .sort((a, b) => b.parts.length - a.parts.length)[0];
  return hit?.f ?? null;
}

/** Show "Windows cannot find 'x.exe'"? Never when the query named a program we can install, a system app, or an exact app name. */
export function showNotFound(opts: { q: string; result: IntentResult; hasOther: boolean; pinned: boolean; systems: number }): boolean {
  if (opts.pinned || opts.systems || detectProgram(opts.q)) return false;
  // Live Jev rates playful prompts high on nonsense while still picking a real fn, so both must agree.
  return !opts.hasOther || (opts.result.signals.nonsense > 0.6 && opts.result.fn.value === "none");
}
