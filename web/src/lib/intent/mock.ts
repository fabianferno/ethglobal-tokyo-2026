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
import { detectProgram } from "@/lib/genshell/detect";

/**
 * Offline keyword classifier with the exact output shape of Jev.
 * Keeps the OS alive with no API key, on flaky venue wifi, and in tests.
 */
export const MOCK_MODEL = "jev-offline";

type Rules<K extends string> = [RegExp, K, number][];

const SHELL_RULES: Rules<ShellKey> = [
  [/\b(excel|spreadsheet|sheet|table|cells?|formula|csv|lotus)\b/, "excel", 6],
  [/\b(mine ?sweeper|mines?|minefield)\b/, "minesweeper", 7],
  [/\b(doom|wolfenstein|quake|fps|first.?person shooter|shooter|raycaster)\b/, "doom", 6.5],
  [/\b(paint|ms ?paint|draw|drawing|canvas|picture|image|meme|art|artwork|pfp|avatar)\b/, "paint", 6],
  [/\b(weather|forecast|climate|sunny|storm|temperature|rain)\b/, "weather", 6],
  [/\b(notepad|diary|journal|notes?|text ?file|log)\b/, "notepad", 5],
  [/\b(3d|3-d|three.?d|hologram|holographic|wireframe|opengl|directx|isometric)\b/, "hologram", 6.5],
  // The app named first wins: "weather app with an image of …" is Weather, not Paint (a picture is content, not the shell).
  [/^\s*(?:an?\s+|open\s+)?(excel|spreadsheet)\b/, "excel", 9],
  [/^\s*(?:an?\s+|open\s+)?(weather)\b/, "weather", 9],
  [/^\s*(?:an?\s+|open\s+)?(notepad)\b/, "notepad", 9],
  [/^\s*(?:an?\s+|open\s+)?(mine ?sweeper)\b/, "minesweeper", 9],
  [/^\s*(?:an?\s+|open\s+)?(doom)\b/, "doom", 9],
  [/^\s*(?:an?\s+|open\s+)?(hologram|3d)\b/, "hologram", 9],
  // NB: "app"/"window" removed — too generic, they used to mask gibberish as a "known" shell.
  [/\b(explorer|dashboard|control panel|file browser|my computer)\b/, "explorer", 1.5],
];

const FN_RULES: Rules<FnKey> = [
  [/\b(portfolio|holdings|balances?|net ?worth|bags?|wallet|rebalance|rebalancing|reweight)\b/, "portfolio", 4],
  // A chart/dashboard OF a wallet's holdings is a portfolio view, not a token price chart.
  [/\b(pie chart|bar chart|allocation|(digital )?asset dashboard|dashboard|pnl|p&l|analytics|holdings? chart)\b/, "portfolio", 6.5],
  // (A bare named ENS/0x target leans portfolio — but only when it isn't an action or a program;
  // applied conditionally in mockClassify, not as a blunt rule, so "send X to kenji.eth" stays open.)
  // "shooting my losses", "down bad", "in the red" — reviewing losses is a portfolio view, not perps.
  [/\b(losses|down bad|underwater|in the red|my (gains|pnl))\b/, "portfolio", 4],
  [/\b(perps?|perpetuals?|futures|leverage[d]?|long|short|\d+x)\b/, "perps", 6],
  [/\b(dca|dollar.?cost|grid ?bot|auto.?buy)\b/, "dca", 6],
  // "buy X every day" and "every week put into Y" — a buy/accumulate verb next to any recurrence, either order.
  [/\b(buy|stack|accumulate|invest|put|into)\b[\s\S]*\b(every|each|daily|weekly|monthly|hourly)\b|\b(every|each|daily|weekly|monthly|hourly)\b[\s\S]*\b(buy|stack|accumulate|invest|into)\b/, "dca", 6],
  [/\b(lp|liquidity|pools?|amm|clmm|range)\b/, "lp", 5],
  [/\b(yields?|apys?|aprs?|interest|savings? (account|rate)|best rates?|lend(ing)?)\b/, "yield", 5],
  [/\b(stakes?|staking|lst|validator)\b/, "stake", 5],
  [/\b(liquidations?|health ?factor|protect my loan|loan|collateral)\b/, "loan_guard", 5],
  [/\b(club|dao|group fund|invest with friends|vote|votes)\b/, "club", 5],
  // "pool money with friends" is a group fund, not liquidity provision — must beat lp's "pool".
  [/\bpool(ing)? (money|funds|cash|together)\b/, "club", 6],
  [/\b(split|splitwise|bills?|shared (tab|expenses)|settle up|roommates)\b|割り勘|わりかん/, "split", 5.5],
  [/\b(savings circle|tanomoshi|rosca|rotating|chit fund|pot)\b/, "savings_circle", 6],
  [/\b(checkout|shop|store|cafe|café|merchant|qr ?pay|point of sale|pos|tip jar|tips?)\b/, "checkout", 5],
  [/\b(subscription|membership|patreon|members only|newsletter|rent|recurring (payment|transfer|bill|charge))\b/, "subscription", 5],
  [/\b(allowance|pocket money|kids?|family wallet)\b/, "allowance", 5.5],
  [/\b(bount(y|ies)|grants?|tasks? board)\b/, "bounty", 5.5],
  [/\b(escrow|freelanc\w*|milestone|release on delivery)\b/, "escrow", 5.5],
  [/\b(rsvp|event|tickets?|meetup|deposit.*check.?in|no.?shows?)\b/, "rsvp", 4.5],
  [/\b(api|pay.?per.?call|sell (my )?data|price feed|x402)\b/, "pay_per_call", 5],
  [/\b(roast|make fun|judge|clown|ngmi|cope|rekt|meme)\b/, "roast", 7],
  [/\b(mood|market (feel|sentiment)|fear|greed|weather|forecast|volatil\w*)\b/, "market_mood", 4],
  [/\b(journal|diary|trades log|trade log|past trades)\b/, "journal", 4.5],
  // Strong price-chart intent.
  [/\b(price ?chart|chart of|candles?|ohlc|price (of|history|action|movement|last|this|today|now|over)|how('?s| is| has) .* (doing|been|performing))\b|チャート|価格/, "price_chart", 5.5],
  // Weak: bare "chart"/"graph"/"price"/"ticker" — loses to portfolio when holdings/allocation/a wallet are named.
  // "gas prices"/"gas tracker" is NOT a token price chart, so exclude a "gas" prefix.
  [/\b(charts?|graph|ticker)\b|(?<!gas )\bprices?\b/, "price_chart", 3],
  // OUTGOING money only: send/tip/transfer to <recipient>, or tip/pay <recipient> <amount>.
  // Never matches "all funds/everything"/"pay me back"/request/invoice — those flow money TO you, and a
  // Send button would send it the wrong way (safety), so they fall through to "cannot find".
  [/\b(send|transfer|remit|wire|tip)\b(?![\s\S]*\b(all (funds|my|the)|everything|me back)\b)[\s\S]*\bto\b[\s\S]*(\.eth|0x[a-f0-9]{6}|\d)|\b(tip|pay)\b(?! ?per)(?! me)\s+[\w.@-]+\s+\d/, "pay", 6.5],
  [/\b(gas|gwei|gas ?fees?|gas ?price|gas ?tracker|transaction (cost|fee)|network fee)\b/, "gas", 6],
  [/\b(compare|versus|vs\.?|side by side|who('?s| is) (richer|winning)|against)\b/, "compare", 6],
  // Where to trade a token: best venue / price across exchanges, DEXes and chains. Beats price_chart's bare "price".
  [/\bwhere (to|should i|can i|do i) (sell|buy|trade|swap|exchange|dump|cash out)\b|\bbest (price|place|venue|exchange|market|rate) (to|for) (sell|buy|trade|swap|exchange)\b|\b(which|what) (exchange|dex|venue|market)\b|\b(cheapest|best) (exchange|dex|venue)s?\b|\barbitrage|\bliquidate\b|\bexit (my )?(position|bag)s?\b|\bprices? (across|on) (exchanges|dexes|chains|venues|markets)\b/, "markets", 7],
  // DEX activity and liquidity flows are the pool view.
  [/\b(dex (activity|volume|trades?|flows?)|trading volume|liquidity (flows?|movements?|moving)|buy.?sell pressure|order ?flow|whales?|whale trades|large trades|swaps? (today|on|activity))\b/, "lp", 6.5],
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
  let fn = classify(FN_KEYS, FN_RULES, t, "none");
  const vibe = classify(VIBES, VIBE_RULES, t, "serious");
  const scene = classify(SCENES, SCENE_RULES, t, "none");

  // A bare named target with no other signal defaults to viewing its portfolio ("vitalik.eth", "0x…"),
  // but never for an action ("send 5 USDC to kenji.eth" stays open for the pay fn) or a program name
  // ("chess of vitalik.eth" → its generated shell), which would otherwise be a confident wrong app.
  if (fn.value === "none" && (/\b[a-z0-9-]+\.eth\b|0x[a-f0-9]{6}/.test(t)) && !/\b(send|sent|pay|paid|paying|payment|transfer|tip|request|invoice|collect|give|invite|claim|revoke|share|withdraw|deposit|rent|recurring)\b/.test(t) && !detectProgram(t)) {
    fn = { value: "portfolio", confidence: 0.68, probabilities: { portfolio: 0.68, none: 0.32 } };
  }

  const known = fn.value !== "none" || shell.value !== "unspecified";
  // Nothing matched (any length, including single words and emoji) → it's a "cannot find X.exe" case.
  const nonsense = known ? 0.04 : 0.7;
  const readOnly = /\b[a-z0-9-]+\.eth\b/.test(t) && !/\b(my|mine)\b/.test(t.replace(/\b[a-z0-9-]+\.eth\b/g, "")) ? 0.85 : 0.08;
  const risk = fn.value === "perps" || /\b\d+x|leverage/.test(t) ? 1.9 : ["portfolio", "roast", "market_mood", "journal", "price_chart", "gas", "compare", "markets", "none"].includes(fn.value) ? 0.1 : 0.9;

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
