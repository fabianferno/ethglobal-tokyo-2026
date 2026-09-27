import type { IconName } from "@/components/win99/Icon";
import { ROOT } from "@/lib/ens/names";
import { detectProgram } from "@/lib/genshell/detect";
import { mockClassify } from "@/lib/intent/mock";
import type { Params } from "@/lib/intent/parse";
import type { ConcreteShell, FnKey, IntentResult, SceneKey, ShellKey, Vibe } from "@/lib/intent/types";
import { FUNCTIONS } from "./functions";
import type { Bundle, ShapeKey } from "./shapes";

/**
 * Which shapes each shell can render (Explorer is the universal fallback), and each shell's
 * NATIVE function — what a bare "notepad app" / "excel" (no crypto function named) should become,
 * so we honor the shell the person asked for instead of defaulting to Portfolio. `none` means
 * "no natural function": fall back to the blank New-App starter rather than force one.
 */
export const SHELL_META: Record<ConcreteShell, { label: string; icon: IconName; nick: string; accepts: ShapeKey[]; defaultFn: FnKey }> = {
  // Some shells accept shapes past their native one: they adapt via lib/compose/adapt.ts (Minesweeper
  // builds a minefield from any numbers, Weather derives a gauge, Paint draws a list) so a named shell
  // is honored for any function instead of falling back to Explorer.
  excel: { label: "Excel", icon: "excel", nick: "sheet", accepts: ["table", "series"], defaultFn: "portfolio" },
  minesweeper: { label: "Minesweeper", icon: "mine", nick: "sweeper", accepts: ["grid", "table", "series"], defaultFn: "perps" },
  doom: { label: "Doom", icon: "flame", nick: "doom", accepts: ["grid", "gauge", "table", "list"], defaultFn: "perps" },
  paint: { label: "Paint", icon: "paint", nick: "paint", accepts: ["scene", "gauge", "table", "series", "list"], defaultFn: "roast" },
  weather: { label: "Weather", icon: "weather", nick: "weather", accepts: ["gauge", "table", "series", "list"], defaultFn: "market_mood" },
  notepad: { label: "Notepad", icon: "notepad", nick: "notes", accepts: ["list", "table"], defaultFn: "journal" },
  hologram: { label: "3D View", icon: "chart", nick: "3d", accepts: ["table", "series", "gauge"], defaultFn: "portfolio" },
  explorer: { label: "Explorer", icon: "computer", nick: "", accepts: ["table", "series", "list", "grid", "gauge", "scene"], defaultFn: "none" },
};

/**
 * The app IS this object. ~1 KB of decisions + params; stored in the agent's ENS text records
 * so anyone who resolves the name rebuilds the same UI instantly, with no model call.
 */
export type AppManifest = {
  id: string;
  ens: string;
  title: string;
  icon: IconName;
  shell: ConcreteShell;
  fn: FnKey;
  vibe: Vibe;
  scene: SceneKey;
  prompt: string;
  params: Params;
  readOnly: boolean;
  target: string;
  owner: string;
  published: boolean;
  description: string;
  users?: number;
};

export function ctxFor(m: AppManifest) {
  return { params: m.params, target: m.target, owner: m.owner, agent: m.ens, vibe: m.vibe, readOnly: m.readOnly };
}

export function buildBundle(m: AppManifest): Bundle {
  // A chain manifest can carry an fn this client build doesn't know (older/newer schema) — never crash
  // the window over it; fall back to the blank app.
  return (FUNCTIONS[m.fn] ?? FUNCTIONS.none).build(ctxFor(m));
}

const hasShape = (b: Bundle, s: ShapeKey) => b[s] !== undefined;

/** Named shell if it can render what the function produces; else the function's default; else Explorer. */
export function resolveShell(shell: ShellKey, fn: FnKey, bundle: Bundle): ConcreteShell {
  const fits = (s: ConcreteShell) => SHELL_META[s]?.accepts.some((k) => hasShape(bundle, k)) ?? false;
  if (shell !== "unspecified" && SHELL_META[shell as ConcreteShell] && fits(shell as ConcreteShell)) return shell as ConcreteShell;
  const d = (FUNCTIONS[fn] ?? FUNCTIONS.none).defaultShell;
  return fits(d) ? d : "explorer";
}

let seq = 0;
export const newId = (p = "app") => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export type Combo = { shell: ConcreteShell; fn: FnKey; p: number };

/**
 * Top shell × fn combos for the "Create new" list. Jev answers shell and fn independently, so the
 * joint probability is their product; incompatible pairs are re-routed by resolveShell.
 */
export function topCombos(intent: IntentResult, k = 3, prompt?: string): Combo[] {
  const shells = Object.entries(intent.shell.probabilities).sort((a, b) => b[1]! - a[1]!).slice(0, 3) as [ShellKey, number][];

  // No crypto function named ("notepad app", "excel"): honor the shell the person actually asked for
  // by pairing it with that shell's native function, instead of falling through to Portfolio. Only a
  // shell Jev is reasonably sure was named (p ≥ 0.2) counts — no cascading to weak secondaries, so a
  // "notepad" search never sprouts a stray Excel/Portfolio token table.
  if (intent.fn.value === "none") {
    const named = shells.filter(([s, ps]) => s !== "unspecified" && ps >= 0.2 && SHELL_META[s as ConcreteShell].defaultFn !== "none") as [ConcreteShell, number][];
    if (named.length > 0) return named.slice(0, k).map(([s, ps]) => ({ shell: s, fn: SHELL_META[s].defaultFn, p: ps }));
    // A recognized retro program with no crypto function (snake, tetris, pong) → give its generated
    // shell portfolio data to play with, instead of the blank New-App starter.
    if (prompt && detectProgram(prompt)) return [{ shell: "excel", fn: "portfolio", p: 1 }];
    // Generic / unthemed / nonsense → the friendly blank New-App starter, never a forced token table.
    return [{ shell: "explorer", fn: "none", p: 1 }];
  }

  const fns = (Object.entries(intent.fn.probabilities).sort((a, b) => b[1]! - a[1]!).slice(0, 4) as [FnKey, number][]).filter(([f]) => f !== "none");
  const seen = new Set<string>();
  const out: Combo[] = [];
  for (const [f, pf] of fns)
    for (const [s, ps] of shells) {
      const shell = s === "unspecified" ? FUNCTIONS[f].defaultShell : s;
      const key = `${shell}:${f}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ shell, fn: f, p: pf * ps });
    }
  return out.sort((a, b) => b.p - a.p).slice(0, k);
}

export function draftManifest(opts: {
  prompt: string;
  intent: IntentResult;
  params: Params;
  owner: string;
  combo?: Combo;
}): AppManifest {
  const { prompt, intent, params, owner } = opts;
  // "paint app with a picture of a cat": only a picture, no money. Jev can over-read the subject ("roast",
  // "portfolio"), so if the prompt minus the picture has no money signal at all, it's a picture app.
  const pictureOnly = !!params.image && mockClassify(prompt.toLowerCase().replace(params.image.toLowerCase(), " ")).fn.value === "none";
  const fn = pictureOnly ? "none" : (opts.combo?.fn ?? (intent.fn.value === "none" ? "none" : intent.fn.value));
  const target = params.ensNames[0] ?? params.addresses?.[0] ?? owner;
  // You can look at anyone's wallet, but an agent can only ever move the owner's money.
  const namedTarget = params.ensNames.length > 0 || (params.addresses?.length ?? 0) > 0;
  // Only "viewing" functions are read-only when the target is someone else. Action functions (pay, split,
  // checkout…) are never read-only just because a counterparty is named — you act as yourself.
  const viewOnly = ["portfolio", "roast", "journal", "market_mood", "price_chart", "compare", "gas", "markets", "yield", "lp"].includes(fn);
  const readOnly = viewOnly && (target !== owner || (intent.signals.readOnly > 0.5 && namedTarget));
  const def = FUNCTIONS[fn];
  const slugBase = pictureOnly ? "picture" : def.slug;
  const label = pictureOnly ? "Picture" : def.label;
  const draft: AppManifest = {
    id: newId(),
    ens: "",
    title: "",
    icon: def.icon,
    shell: "explorer",
    fn,
    vibe: intent.vibe.value,
    scene: intent.scene.value,
    prompt,
    params,
    readOnly,
    target,
    owner,
    published: false,
    description: "",
  };
  const bundle = buildBundle({ ...draft, ens: `${slugBase}.${ROOT}` });
  const askedShell = opts.combo?.shell ?? intent.shell.value;
  const shell = resolveShell(pictureOnly && askedShell === "unspecified" ? "paint" : askedShell, fn, bundle);
  const nick = shell === def.defaultShell || shell === "explorer" ? "" : SHELL_META[shell].nick;
  const ens = `${nick ? `${slugBase}-${nick}` : slugBase}.${ROOT}`;
  const title = shell === "explorer" ? label : `${SHELL_META[shell].label} · ${label}`;
  // 0x addresses show as 0xd8dA…6045, not the full lowercased string; compare names both wallets.
  const shortAddr = (x: string) => (/^0x[a-f0-9]{40}/i.test(x) ? `${x.slice(0, 6)}…${x.slice(-4)}` : x);
  const named = [...params.ensNames, ...(params.addresses ?? [])];
  const targetLabel = fn === "compare" && named.length >= 2 ? named.slice(0, 2).map(shortAddr).join(" vs ") : shortAddr(target);
  return {
    ...draft,
    ens,
    shell,
    icon: shell === "explorer" ? def.icon : SHELL_META[shell].icon,
    title: target !== owner ? `${title} — ${targetLabel}` : title,
    description: `${shell !== "explorer" ? SHELL_META[shell].label + " — " : ""}${pictureOnly ? `A picture of ${params.image}` : def.blurb({ params, target, owner, agent: ens, vibe: draft.vibe, readOnly })}`,
  };
}
