/**
 * Deterministic value extraction. Jev decides WHAT the app is; this reads the numbers,
 * names and schedules out of the text. Runs on the client on every keystroke.
 */

export type Schedule = "hourly" | "daily" | "weekly" | "monthly";

export type Params = {
  ensNames: string[];
  /** 0x wallet addresses (EVM or Sui) named as a target. */
  addresses: string[];
  tokens: string[];
  amount?: { value: number; unit: string };
  leverage?: number;
  schedule?: Schedule;
  percent?: number;
  members?: number;
  /** Trade direction for perps, when stated. */
  side?: "long" | "short";
  /** Rebalance target weights (percentages), paired with tokens in order. */
  weights?: number[];
  /** Mentions the person's own wallet ("my portfolio"). */
  mine: boolean;
  /** Time window in days ("60 days", "3 months", "1y"), for charts. */
  days?: number;
  /** A picture the person asked to see in the app ("with a picture of mt fuji", "draw a cat"). */
  image?: string;
};

const TOKENS = ["SUI", "USDC", "USDT", "DEEP", "WAL", "CETUS", "ETH", "BTC", "WBTC", "SOL", "NAVX", "SCA", "PEPE", "DOGE", "SHIB", "BNB", "XRP", "LINK", "ARB", "OP", "ADA", "AAPL", "TSLA", "NVDA", "JPY"];
// Spelled-out and Japanese coin names → ticker, so "bitcoin price" / "ビットコインのチャート" resolve a symbol.
const ALIASES: Record<string, string> = {
  bitcoin: "BTC", ethereum: "ETH", ether: "ETH", solana: "SOL", dogecoin: "DOGE", ripple: "XRP", cardano: "ADA", polygon: "MATIC", avalanche: "AVAX",
  ビットコイン: "BTC", イーサリアム: "ETH", イーサ: "ETH", ソラナ: "SOL", ドージ: "DOGE", スイ: "SUI",
};
const WORD_NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };

export function parse(text: string): Params {
  const t = text.toLowerCase();
  const ensNames = [...new Set(t.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth\b/g) ?? [])];
  const addresses = [...new Set(t.match(/0x[a-f0-9]{40}(?:[a-f0-9]{24})?/g) ?? [])];

  // Strip ENS names before token matching so "vitalik.eth" doesn't count as an ETH token.
  const tokenText = t.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth\b/g, " ");
  const tokens = TOKENS.filter((sym) => new RegExp(`\\b${sym.toLowerCase()}\\b`).test(tokenText));
  for (const [name, sym] of Object.entries(ALIASES)) {
    const hit = /^[a-z]+$/.test(name) ? new RegExp(`\\b${name}\\b`).test(tokenText) : t.includes(name);
    if (hit && !tokens.includes(sym)) tokens.push(sym);
  }

  let amount: Params["amount"];
  const money = t.match(/(?:(\$|¥|usd\s?)\s?(\d[\d,]*(?:\.\d+)?))|(?:(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?(usdc|usdt|sui|usd|dollars?|yen|jpy|eth)\b)/);
  if (money) {
    if (money[2]) amount = { value: num(money[2]), unit: money[1] === "¥" ? "JPY" : "USD" };
    else amount = { value: num(money[3]) * (money[4] ? 1000 : 1), unit: normUnit(money[5]) };
  }

  const lev = t.match(/(\d{1,3})\s?x\b/);
  const leverage = lev ? Math.min(100, Number(lev[1])) : undefined;

  const schedule: Schedule | undefined = /\b(hourly|every hour|each hour)\b/.test(t)
    ? "hourly"
    : /\b(daily|every day|each day|every morning|every night)\b/.test(t)
      ? "daily"
      : /\b(weekly|every week|each week|a week)\b/.test(t)
        ? "weekly"
        : /\b(monthly|every month|each month|a month)\b/.test(t)
          ? "monthly"
          : undefined;

  const pct = t.match(/(\d+(?:\.\d+)?)\s?%/);
  const percent = pct ? Number(pct[1]) : undefined;

  // Rebalance target weights: "60/40", "60/30/10", or "60% ... 40% ...".
  let weights: number[] | undefined;
  const slash = t.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})(?:\s*\/\s*(\d{1,3}))?\b/);
  if (slash) weights = slash.slice(1).filter(Boolean).map(Number);
  else {
    const pcts = [...t.matchAll(/(\d{1,3})\s?%/g)].map((m) => Number(m[1]));
    if (pcts.length >= 2) weights = pcts;
  }

  const mem = t.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(friends|people|members|roommates|teammates|of us)\b/);
  // Explicit count wins; else count the named participants (+ me) so "split with alice.eth and bob.eth" = 3.
  const members = mem ? (WORD_NUM[mem[1]] ?? Number(mem[1])) : ensNames.length > 0 ? ensNames.length + 1 : undefined;

  const side: Params["side"] = /\b(short|sell|bear|puts?)\b/.test(t) ? "short" : /\b(long|bull|calls?)\b/.test(t) ? "long" : undefined;

  const mine = /\b(my|mine|me|i)\b/.test(t) && ensNames.length === 0 && addresses.length === 0;

  return { ensNames, addresses, tokens, amount, leverage, schedule, percent, members, side, weights, mine, days: parseDays(t), image: parseImage(text) };
}

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90, hundred: 100, couple: 2, "couple of": 2, few: 3, "a few": 3 };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 86_400_000;

/**
 * Any time window a person might type, as days (fractional for hours; not clamped here, the chart clamps to what
 * the data source serves): "60 days", "two weeks", "last 6 months", "90d", "1.5y", "48 hours", "today", "ytd",
 * "this year", "since march", "since jan 2025", "since 2024", "last quarter", "all time". Undefined = the app's default.
 */
export function parseDays(t: string, now = Date.now()): number | undefined {
  // Recurring schedules ("every 7 days") are not a chart window.
  const s = t.replace(/\bevery\s+(\d+|\w+)\s+\w+/g, " ");
  const n = "(\\d+(?:\\.\\d+)?|a few|couple of|couple|few|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|sixty|ninety|hundred)";
  const unit = "(h|hrs?|hours?|d|days?|w|wks?|weeks?|mo|mos|months?|q|qtrs?|quarters?|y|yrs?|years?)";
  const m = s.match(new RegExp(`\\b${n}[\\s-]?${unit}\\b`));
  if (m) {
    const v = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]];
    // Bare "1 d"/"1 y" are fine; "a d" is not a window.
    if (v && !(/^(an?)$/.test(m[1]) && m[2].length === 1)) {
      const u = m[2];
      const per = /^h/.test(u) ? 1 / 24 : /^d/.test(u) ? 1 : /^w/.test(u) ? 7 : /^mo/.test(u) ? 30 : /^q/.test(u) ? 91 : 365;
      return v * per;
    }
  }
  if (/\b(today|intraday|24 ?h|last day|past day)\b/.test(s)) return 1;
  if (/\b(this|last|past) week\b|\bweekly chart\b/.test(s)) return 7;
  if (/\b(this|last|past) month\b|\bmonthly chart\b/.test(s)) return 30;
  if (/\b(this|last|past) quarter\b/.test(s)) return 91;
  if (/\b(ytd|year to date|this year)\b/.test(s)) return Math.max(1, (now - Date.UTC(new Date(now).getUTCFullYear(), 0, 1)) / DAY_MS);
  if (/\b(last|past) year\b|\byearly chart\b/.test(s)) return 365;
  if (/\b(all[- ]time|ever|since (launch|inception|the beginning|genesis)|max(imum)? (history|range)?|full history|entire history)\b/.test(s)) return 3650;
  const since = s.match(new RegExp(`\\bsince\\s+(?:(${MONTHS.join("|")})[a-z]*\\.?\\s*(\\d{4})?|(\\d{4}))\\b`));
  if (since) {
    const year = Number(since[2] ?? since[3] ?? new Date(now).getUTCFullYear());
    const month = since[1] ? MONTHS.indexOf(since[1]) : 0;
    let start = Date.UTC(year, month, 1);
    if (start > now) start = Date.UTC(year - 1, month, 1); // "since december" in March = last December
    return Math.max(1, (now - start) / DAY_MS);
  }
  return undefined;
}

// Money words: "draw my portfolio" is a chart, not a picture.
const NOT_A_PICTURE = /\b(chart|graph|price|prices|portfolio|pnl|p&l|balance|holdings?|yields?|apy|apr|gas|volume|liquidity|candles?|wallet|losses|gains|tokens?|volatility|market|sentiment|mood|pools?|dex|trades?|swaps?|staking|stake|dca|perps?|futures|split|bills?|tab|send|pay|usdc|usdt|eth|btc|sui|sol)\b|\.eth\b|0x[0-9a-f]/;
/** The subject of a requested picture, as the person wrote it. Deterministic: explicit picture words only. */
function parseImage(text: string): string | undefined {
  const t = text.trim();
  const m =
    t.match(/\b(?:an?\s+|the\s+|some\s+)?(?:picture|pic|image|photo|photograph|drawing|illustration|painting|portrait|wallpaper|poster|sketch|artwork)s?\s+of\s+(.+)$/i) ??
    t.match(/\b(?:draw|paint|sketch|illustrate)\s+(?:me\s+)?((?:an?|the|some)\s+.+)$/i) ??
    t.match(/\bwith\s+(?:an?\s+)?(?:picture|pic|image|photo|drawing|illustration)\s*[:-]?\s+(.+)$/i);
  if (!m) return undefined;
  // Stop at the app-plumbing tail: "… on it", "… in it", "… in the background", "… as the background".
  let subject = m[1]
    .replace(/\s+(?:on|in|inside|into)\s+(?:it|the app|the window|there|the background|the corner)\b.*$/i, "")
    .replace(/\s+as\s+(?:the\s+|a\s+)?(?:background|wallpaper|header|cover)\b.*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  // "a picture of tokyo tower and eth volatility": the picture ends where the money part of the sentence starts.
  const sep = /\s*(?:,|;|\band\b|\bwith\b|\bplus\b|\bnext to\b|\bbeside\b|\bbut\b)\s*/gi;
  for (const m of subject.matchAll(sep)) {
    const rest = subject.slice(m.index! + m[0].length).split(sep)[0];
    if (NOT_A_PICTURE.test(rest.toLowerCase())) {
      subject = subject.slice(0, m.index).replace(/[\s,;]+$/, "");
      break;
    }
  }
  if (subject.length < 2 || NOT_A_PICTURE.test(subject.toLowerCase())) return undefined;
  return subject.slice(0, 160);
}

function num(s: string) {
  return Number(s.replace(/,/g, ""));
}
function normUnit(u: string) {
  if (/dollar|usd$/.test(u)) return "USD";
  if (/yen|jpy/.test(u)) return "JPY";
  return u.toUpperCase();
}

/** Human-readable chips for the parsed values, shown under the search box. */
export function paramChips(p: Params): string[] {
  const out: string[] = [];
  for (const n of p.ensNames) out.push(`👤 ${n}`);
  for (const a of p.addresses ?? []) out.push(`👤 ${a.slice(0, 6)}…${a.slice(-4)}`);
  if (p.mine) out.push("👤 my wallet");
  if (p.tokens.length) out.push(`🪙 ${p.tokens.join("/")}`);
  if (p.amount) out.push(`💰 ${p.amount.value.toLocaleString()} ${p.amount.unit}`);
  if (p.leverage) out.push(`⚡ ${p.leverage}x`);
  if (p.schedule) out.push(`🕑 ${p.schedule}`);
  if (p.percent !== undefined) out.push(`％ ${p.percent}%`);
  if (p.members) out.push(`👥 ${p.members}`);
  if (p.weights) out.push(`⚖️ ${p.weights.join("/")}`);
  if (p.days) out.push(`📅 ${p.days < 1.5 ? `${Math.round(p.days * 24)}h` : p.days >= 3650 ? "all time" : `${Math.round(p.days)}d`}`);
  if (p.image) out.push(`🖼️ ${p.image.length > 24 ? `${p.image.slice(0, 24)}…` : p.image}`);
  return out;
}

