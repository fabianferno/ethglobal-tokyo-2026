import {
  type Answer,
  type Candidate,
  FN_KEYS,
  type FnKey,
  type IntentResult,
  noneResult,
  SCENES,
  type SceneKey,
  SHELL_KEYS,
  type ShellKey,
  VIBES,
  type Vibe,
} from "./types";

/**
 * Offline keyword classifier with the exact output shape of Jev.
 * Keeps the OS alive with no API key, on flaky venue wifi, and in tests.
 */
export const MOCK_MODEL = "jev-offline";

type Rules<K extends string> = [RegExp, K, number][];

const SHELL_RULES: Rules<ShellKey> = [
  [/\b(excel|spreadsheet|sheet|table|cells?|formula|csv|lotus)\b/, "excel", 6],
  [/\b(mine ?sweeper|mines?|minefield)\b/, "minesweeper", 7],
  [/\b(paint|ms ?paint|draw|drawing|canvas|picture|image|meme|art|artwork|pfp|avatar)\b/, "paint", 6],
  [/\b(weather|forecast|climate|sunny|storm|temperature|rain)\b/, "weather", 6],
  [/\b(notepad|diary|journal|notes?|text ?file|log)\b/, "notepad", 5],
  [/\b(explorer|dashboard|control panel|window|app)\b/, "explorer", 1.5],
];

const FN_RULES: Rules<FnKey> = [
  [/\b(portfolio|holdings|balances?|net ?worth|bags?|wallet)\b/, "portfolio", 4],
  [/\b(perps?|perpetuals?|futures|leverage[d]?|long|short|\d+x)\b/, "perps", 6],
  [/\b(dca|dollar.?cost|grid ?bot|every (day|week|hour)).*\b(buy|into)\b|\b(dca|grid ?bot|auto.?buy)\b/, "dca", 6],
  [/\b(lp|liquidity|pool|amm|clmm|range)\b/, "lp", 5],
  [/\b(yield|apy|apr|interest|savings? (account|rate)|best rate|lend(ing)?)\b/, "yield", 5],
  [/\b(stake|staking|lst|validator)\b/, "stake", 5],
  [/\b(liquidation|health ?factor|protect my loan|loan|collateral)\b/, "loan_guard", 5],
  [/\b(club|dao|group fund|invest with friends|vote|votes)\b/, "club", 5],
  [/\b(split|splitwise|bills?|shared (tab|expenses)|settle up|roommates)\b/, "split", 5.5],
  [/\b(savings circle|tanomoshi|rosca|rotating|chit fund|pot)\b/, "savings_circle", 6],
  [/\b(checkout|shop|store|cafe|café|merchant|qr ?pay|point of sale|pos|tip jar|tips?)\b/, "checkout", 5],
  [/\b(subscription|membership|patreon|members only|newsletter)\b/, "subscription", 5],
  [/\b(allowance|pocket money|kids?|family wallet)\b/, "allowance", 5.5],
  [/\b(bount(y|ies)|grants?|tasks? board)\b/, "bounty", 5.5],
  [/\b(escrow|freelanc\w*|milestone|release on delivery)\b/, "escrow", 5.5],
  [/\b(rsvp|event|tickets?|meetup|deposit.*check.?in|no.?shows?)\b/, "rsvp", 4.5],
  [/\b(api|pay.?per.?call|sell (my )?data|price feed|x402)\b/, "pay_per_call", 5],
  [/\b(roast|make fun|judge|clown|ngmi|cope|rekt)\b/, "roast", 7],
  [/\b(mood|market (feel|sentiment)|fear|greed|weather|forecast|volatil\w*)\b/, "market_mood", 4],
  [/\b(journal|diary|history|trades log|trade log|past trades)\b/, "journal", 4.5],
];

const VIBE_RULES: Rules<Vibe> = [
  [/\b(roast|make fun|clown|ngmi|rekt|judge)\b/, "roast", 6],
  [/\b(game|minesweeper|fun|silly|pinball|solitaire|meme)\b/, "playful", 3],
  [/\b(moon|pump|bull|lfg|degen|ape)\b/, "hype", 4],
  [/\b(chill|calm|relax|cozy|zen)\b/, "chill", 4],
];

const SCENE_RULES: Rules<SceneKey> = [
  [/\b(roast|burn|fire|degen|rekt)\b/, "fire", 5],
  [/\b(perps?|futures|leverage|\d+x|liquidat\w*|crash|storm|volatil\w*)\b/, "storm", 4],
  [/\b(moon|pump|rocket|gains?|bull)\b/, "rocket", 4],
  [/\b(friends?|team|tokyo|japan|club|circle|tanomoshi|family|kids?)\b/, "sakura", 3.5],
  [/\b(lp|liquidity|pool|yield|stake|staking|savings)\b/, "pool", 3.5],
  [/\b(portfolio|excel|stocks?|ticker|trade|dca|grid|prices?)\b/, "ticker", 3],
  [/\b(pay|split|bills?|checkout|shop|tips?|subscription|allowance|escrow|bount\w*|coins?)\b/, "coins", 3],
];

function classify<K extends string>(keys: readonly K[], rules: Rules<K>, t: string, fallback: K, temp = 0.9): Answer<K> {
  const s: Partial<Record<K, number>> = {};
  for (const [re, k, w] of rules) if (re.test(t)) s[k] = (s[k] ?? 0) + w;
  s[fallback] = (s[fallback] ?? 0) + 1.2;
  const exps = keys.map((k) => Math.exp((s[k] ?? 0) / temp));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(keys.map((k, i) => [k, exps[i] / sum])) as Record<K, number>;
  const value = keys.reduce((a, b) => (probabilities[b] > probabilities[a] ? b : a));
  return { value, confidence: probabilities[value], probabilities };
}

const STOP = new Set(["the", "a", "an", "for", "my", "with", "and", "of", "to", "app", "but", "that", "on", "at", "in", "is", "it", "me"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 1 && !STOP.has(w));

export function mockMatches(text: string, candidates: Candidate[]): Record<string, number> {
  const q = words(text);
  const out: Record<string, number> = {};
  for (const c of candidates) {
    const d = words(c.description + " " + c.id);
    const hits = q.filter((w) => d.some((x) => x.startsWith(w) || w.startsWith(x))).length;
    out[c.id] = q.length ? Math.min(0.97, 0.05 + (hits / q.length) * 0.95) : 0;
  }
  return out;
}

export function mockClassify(text: string, candidates: Candidate[] = []): IntentResult {
  const t = text.toLowerCase().trim();
  if (t.length < 2) return noneResult({ model: MOCK_MODEL, source: "mock" });

  const shell = classify(SHELL_KEYS, SHELL_RULES, t, "unspecified");
  const fn = classify(FN_KEYS, FN_RULES, t, "none");
  const vibe = classify(VIBES, VIBE_RULES, t, "serious");
  const scene = classify(SCENES, SCENE_RULES, t, "none");

  const known = fn.value !== "none" || shell.value !== "unspecified";
  const nonsense = known ? 0.04 : t.split(/\s+/).length >= 2 ? 0.7 : 0.35;
  const readOnly = /\b[a-z0-9-]+\.eth\b/.test(t) && !/\b(my|mine)\b/.test(t.replace(/\b[a-z0-9-]+\.eth\b/g, "")) ? 0.85 : 0.08;
  const risk = fn.value === "perps" || /\b\d+x|leverage/.test(t) ? 1.9 : ["portfolio", "roast", "market_mood", "journal", "none"].includes(fn.value) ? 0.1 : 0.9;

  return {
    shell,
    fn,
    vibe,
    scene,
    signals: {
      readOnly,
      recurring: /\b(every|daily|weekly|monthly|hourly|recurring|subscription|schedule)\b/.test(t) ? 0.9 : 0.1,
      nonsense,
      risk,
    },
    matches: mockMatches(t, candidates),
    latencyMs: Math.round(70 + Math.random() * 90),
    model: MOCK_MODEL,
    source: "mock",
  };
}
