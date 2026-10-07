/**
 * Shared vocabulary between Jev (server), the offline classifier and the composer.
 * Every prompt = SHELL (a familiar Win98 program) × SHAPE (what the content is) × VIBE × SCENE.
 */

export const SHELL_KEYS = ["excel", "minesweeper", "doom", "paint", "weather", "notepad", "hologram", "explorer", "unspecified"] as const;
export type ShellKey = (typeof SHELL_KEYS)[number];
export type ConcreteShell = Exclude<ShellKey, "unspecified">;

export const SHAPE_KEYS = ["table", "list", "series", "gauge", "scene", "grid", "doc", "picture"] as const;
export type ShapeKey = (typeof SHAPE_KEYS)[number];

export const VIBES = ["serious", "playful", "roast", "hype", "chill"] as const;
export type Vibe = (typeof VIBES)[number];

export const SCENES = ["sparkle", "ticker", "storm", "rocket", "sakura", "pool", "fire", "none"] as const;
export type SceneKey = (typeof SCENES)[number];

export type Answer<T extends string> = {
  value: T;
  confidence: number;
  probabilities: Partial<Record<T, number>>;
};

export type IntentResult = {
  shell: Answer<ShellKey>;
  shape: Answer<ShapeKey>;
  vibe: Answer<Vibe>;
  scene: Answer<SceneKey>;
  signals: { nonsense: number };
  latencyMs: number;
  model: string;
  source: "jev" | "mock" | "none";
  cached?: boolean;
  error?: boolean;
};

export function noneResult(extra: Partial<IntentResult> = {}): IntentResult {
  const a = <T extends string>(value: T): Answer<T> => ({ value, confidence: 1, probabilities: { [value]: 1 } as Partial<Record<T, number>> });
  return {
    shell: a<ShellKey>("unspecified"),
    shape: a<ShapeKey>("list"),
    vibe: a<Vibe>("serious"),
    scene: a<SceneKey>("none"),
    signals: { nonsense: 1 },
    latencyMs: 0,
    model: "none",
    source: "none",
    ...extra,
  };
}

/** Top-k labels of a choice answer, most likely first. */
export function topK<T extends string>(a: Answer<T>, k: number): { value: T; p: number }[] {
  return (Object.entries(a.probabilities) as [T, number][])
    .sort((x, y) => y[1] - x[1])
    .slice(0, k)
    .map(([value, p]) => ({ value, p }));
}
