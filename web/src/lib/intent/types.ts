/**
 * Shared vocabulary between Jev (server), the offline classifier and the composer.
 * Every prompt = SHELL (a familiar Win99 app) × FN (a crypto capability) × TARGET × VIBE.
 */

export const SHELL_KEYS = ["excel", "minesweeper", "doom", "paint", "weather", "notepad", "hologram", "explorer", "unspecified"] as const;
export type ShellKey = (typeof SHELL_KEYS)[number];
export type ConcreteShell = Exclude<ShellKey, "unspecified">;

export const FN_KEYS = [
  "portfolio",
  "perps",
  "dca",
  "lp",
  "yield",
  "stake",
  "loan_guard",
  "club",
  "split",
  "pay",
  "savings_circle",
  "checkout",
  "subscription",
  "allowance",
  "bounty",
  "escrow",
  "rsvp",
  "pay_per_call",
  "roast",
  "market_mood",
  "journal",
  "price_chart",
  "gas",
  "compare",
  "none",
] as const;
export type FnKey = (typeof FN_KEYS)[number];

export const VIBES = ["serious", "playful", "roast", "hype", "chill"] as const;
export type Vibe = (typeof VIBES)[number];

export const SCENES = ["coins", "ticker", "storm", "rocket", "sakura", "pool", "fire", "none"] as const;
export type SceneKey = (typeof SCENES)[number];

export type Answer<T extends string> = {
  value: T;
  confidence: number;
  probabilities: Partial<Record<T, number>>;
};

export type IntentResult = {
  shell: Answer<ShellKey>;
  fn: Answer<FnKey>;
  vibe: Answer<Vibe>;
  scene: Answer<SceneKey>;
  signals: {
    /** Probability the person wants to look at someone else's data rather than act on their own funds. */
    readOnly: number;
    recurring: number;
    nonsense: number;
    /** 0..2 expected score: how risky this app is for the person's money. */
    risk: number;
  };
  /** Published-app candidate id → probability it does what the person wants. */
  matches: Record<string, number>;
  latencyMs: number;
  model: string;
  source: "jev" | "mock" | "none";
  cached?: boolean;
  error?: boolean;
};

export type Candidate = { id: string; description: string };

export function noneResult(extra: Partial<IntentResult> = {}): IntentResult {
  const a = <T extends string>(value: T): Answer<T> => ({ value, confidence: 1, probabilities: { [value]: 1 } as Partial<Record<T, number>> });
  return {
    shell: a<ShellKey>("unspecified"),
    fn: a<FnKey>("none"),
    vibe: a<Vibe>("serious"),
    scene: a<SceneKey>("none"),
    signals: { readOnly: 0, recurring: 0, nonsense: 0, risk: 0 },
    matches: {},
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
