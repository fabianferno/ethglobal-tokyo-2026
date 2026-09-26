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

  return { ensNames, addresses, tokens, amount, leverage, schedule, percent, members, side, weights, mine };
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
  return out;
}
