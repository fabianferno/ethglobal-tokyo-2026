import type { IconName } from "@/components/win99/Icon";
import { detectProgram } from "@/lib/genshell/detect";
import type { Params } from "@/lib/intent/parse";
import type { ConcreteShell, IntentResult, SceneKey, ShapeKey, ShellKey, Vibe } from "@/lib/intent/types";

/**
 * Which shapes each shell can render (adapters in ./adapt.ts stretch some: Minesweeper builds a field from
 * numbers, Weather derives a gauge, Paint draws a list), and what a bare "excel" or "notepad" means.
 */
export const SHELL_META: Record<ConcreteShell, { label: string; icon: IconName; accepts: ShapeKey[]; defaultShape: ShapeKey }> = {
  excel: { label: "Excel", icon: "excel", accepts: ["table", "series", "list"], defaultShape: "table" },
  minesweeper: { label: "Minesweeper", icon: "mine", accepts: ["grid", "table", "series"], defaultShape: "grid" },
  doom: { label: "Doom", icon: "flame", accepts: ["grid", "gauge", "table", "list"], defaultShape: "grid" },
  paint: { label: "Paint", icon: "paint", accepts: ["scene", "picture", "gauge", "table", "series", "list"], defaultShape: "scene" },
  weather: { label: "Weather", icon: "weather", accepts: ["gauge", "table", "series", "list"], defaultShape: "gauge" },
  notepad: { label: "Notepad", icon: "notepad", accepts: ["doc", "list", "table"], defaultShape: "doc" },
  hologram: { label: "3D View", icon: "chart", accepts: ["series", "table", "gauge"], defaultShape: "series" },
  explorer: { label: "Explorer", icon: "computer", accepts: ["table", "list", "series", "gauge", "scene", "grid", "doc", "picture"], defaultShape: "list" },
};

export const SHAPE_DEFAULT_SHELL: Record<ShapeKey, ConcreteShell> = {
  table: "excel",
  list: "explorer",
  series: "explorer",
  gauge: "weather",
  scene: "paint",
  grid: "minesweeper",
  doc: "notepad",
  picture: "paint",
};

/** The app IS this object: a few decisions + the prompt. It lives only in its window. */
export type AppManifest = {
  id: string;
  title: string;
  icon: IconName;
  shell: ConcreteShell;
  shape: ShapeKey;
  vibe: Vibe;
  scene: SceneKey;
  prompt: string;
  params: Params;
  description: string;
  /** How long Jev took to compose this app, and whether it was Jev or the offline classifier. */
  jevMs: number;
  jevSource: IntentResult["source"];
};

/** The named shell if it can render the shape; else the shape's own shell. */
export function resolveShell(shell: ShellKey, shape: ShapeKey): ConcreteShell {
  if (shell !== "unspecified" && SHELL_META[shell as ConcreteShell]?.accepts.includes(shape)) return shell as ConcreteShell;
  return SHAPE_DEFAULT_SHELL[shape];
}

let seq = 0;
export const newId = (p = "app") => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export type Combo = { shell: ConcreteShell; shape: ShapeKey; p: number };

/** Top shell × shape combos for the Start menu. Jev answers both independently, so the joint p is their product. */
export function topCombos(intent: IntentResult, k = 3, prompt?: string): Combo[] {
  if (intent.signals.nonsense > 0.6 && !(prompt && detectProgram(prompt))) return [];
  const shells = Object.entries(intent.shell.probabilities).sort((a, b) => b[1]! - a[1]!).slice(0, 3) as [ShellKey, number][];
  const shapes = Object.entries(intent.shape.probabilities).sort((a, b) => b[1]! - a[1]!).slice(0, 3) as [ShapeKey, number][];
  const seen = new Set<string>();
  const out: Combo[] = [];
  for (const [sh, ps] of shapes)
    for (const [s, pl] of shells) {
      const shell = resolveShell(s, sh);
      const key = `${shell}:${sh}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ shell, shape: sh, p: ps * pl });
    }
  return out.sort((a, b) => b.p - a.p).slice(0, k);
}

/** "excel of the best ramen in tokyo" → "Best ramen in tokyo". */
const titleFrom = (prompt: string) => {
  const t = prompt
    .trim()
    .replace(/^(make|open|show me|create)\s+/i, "")
    .replace(/^(an?\s+)?(excel|minesweeper|doom|paint|weather|notepad|3d|hologram|explorer)\s+((of|but|with|about|for)\s+)?/i, "")
    .replace(/^(of|but|about|an?|the)\s+/i, "");
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s || "Untitled";
};

/** The longest prompt the intent and content APIs accept. */
export const MAX_PROMPT = 400;

export function draftManifest(opts: { prompt: string; intent: IntentResult; params: Params; combo?: Combo }): AppManifest {
  const { intent } = opts;
  const prompt = opts.prompt.trim().slice(0, MAX_PROMPT);
  const shape = opts.combo?.shape ?? intent.shape.value;
  const shell = opts.combo?.shell ?? resolveShell(intent.shell.value, shape);
  const params = shape === "picture" && !opts.params.image ? { ...opts.params, image: prompt.trim() } : opts.params;
  const meta = SHELL_META[shell];
  return {
    id: newId(),
    title: `${meta.label} · ${titleFrom(prompt)}`,
    icon: meta.icon,
    shell,
    shape,
    vibe: intent.vibe.value,
    scene: intent.scene.value,
    prompt,
    params,
    description: `${meta.label} — ${prompt.trim()}`,
    jevMs: intent.latencyMs,
    jevSource: intent.source,
  };
}
