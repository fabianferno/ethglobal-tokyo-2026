import type { IconName } from "@/components/win99/Icon";
import { ROOT } from "@/lib/ens/names";
import type { Params } from "@/lib/intent/parse";
import type { ConcreteShell, FnKey, IntentResult, SceneKey, ShellKey, Vibe } from "@/lib/intent/types";
import { FUNCTIONS } from "./functions";
import type { Bundle, ShapeKey } from "./shapes";

/** Which shapes each shell can render. Explorer is the universal fallback. */
export const SHELL_META: Record<ConcreteShell, { label: string; icon: IconName; nick: string; accepts: ShapeKey[] }> = {
  excel: { label: "Excel", icon: "excel", nick: "sheet", accepts: ["table", "series"] },
  minesweeper: { label: "Minesweeper", icon: "mine", nick: "sweeper", accepts: ["grid"] },
  paint: { label: "Paint", icon: "paint", nick: "paint", accepts: ["scene", "gauge", "table"] },
  weather: { label: "Weather", icon: "weather", nick: "weather", accepts: ["gauge"] },
  notepad: { label: "Notepad", icon: "notepad", nick: "notes", accepts: ["list", "table"] },
  explorer: { label: "Explorer", icon: "computer", nick: "", accepts: ["table", "series", "list", "grid", "gauge", "scene"] },
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
  return FUNCTIONS[m.fn].build(ctxFor(m));
}

const hasShape = (b: Bundle, s: ShapeKey) => b[s] !== undefined;

/** Named shell if it can render what the function produces; else the function's default; else Explorer. */
export function resolveShell(shell: ShellKey, fn: FnKey, bundle: Bundle): ConcreteShell {
  const fits = (s: ConcreteShell) => SHELL_META[s].accepts.some((k) => hasShape(bundle, k));
  if (shell !== "unspecified" && fits(shell)) return shell;
  const d = FUNCTIONS[fn].defaultShell;
  return fits(d) ? d : "explorer";
}

let seq = 0;
export const newId = (p = "app") => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export type Combo = { shell: ConcreteShell; fn: FnKey; p: number };

/**
 * Top shell × fn combos for the "Create new" list. Jev answers shell and fn independently, so the
 * joint probability is their product; incompatible pairs are re-routed by resolveShell.
 */
export function topCombos(intent: IntentResult, k = 3): Combo[] {
  const shells = Object.entries(intent.shell.probabilities).sort((a, b) => b[1]! - a[1]!).slice(0, 3) as [ShellKey, number][];
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
  const fn = opts.combo?.fn ?? (intent.fn.value === "none" ? "none" : intent.fn.value);
  const target = params.ensNames[0] ?? owner;
  // You can look at anyone's wallet, but an agent can only ever move the owner's money.
  const readOnly = target !== owner || (intent.signals.readOnly > 0.5 && params.ensNames.length > 0);
  const def = FUNCTIONS[fn];
  const slugBase = def.slug;
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
  const shell = resolveShell(opts.combo?.shell ?? intent.shell.value, fn, bundle);
  const nick = shell === def.defaultShell || shell === "explorer" ? "" : SHELL_META[shell].nick;
  const ens = `${nick ? `${slugBase}-${nick}` : slugBase}.${ROOT}`;
  const title = shell === "explorer" ? def.label : `${SHELL_META[shell].label} · ${def.label}`;
  return {
    ...draft,
    ens,
    shell,
    icon: shell === "explorer" ? def.icon : SHELL_META[shell].icon,
    title: target !== owner ? `${title} — ${target}` : title,
    description: `${shell !== "explorer" ? SHELL_META[shell].label + " — " : ""}${def.blurb({ params, target, owner, agent: ens, vibe: draft.vibe, readOnly })}`,
  };
}
