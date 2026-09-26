/**
 * Deterministic value extraction. Jev decides WHAT the app is; this reads the numbers,
 * names and schedules out of the text. Runs on the client on every keystroke.
 */

export type Schedule = "hourly" | "daily" | "weekly" | "monthly";

export type Params = {
  ensNames: string[];
  tokens: string[];
  amount?: { value: number; unit: string };
  leverage?: number;
  schedule?: Schedule;
  percent?: number;
  members?: number;
  /** Mentions the person's own wallet ("my portfolio"). */
  mine: boolean;
};

const TOKENS = ["SUI", "USDC", "USDT", "DEEP", "WAL", "CETUS", "ETH", "BTC", "WBTC", "SOL", "NAVX", "SCA", "AAPL", "TSLA", "NVDA", "JPY"];
const WORD_NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };

export function parse(text: string): Params {
  const t = text.toLowerCase();
  const ensNames = [...new Set(t.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth\b/g) ?? [])];

  const tokens = TOKENS.filter((sym) => new RegExp(`\\b${sym.toLowerCase()}\\b`).test(t));

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

  const mem = t.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(friends|people|members|roommates|teammates|of us)\b/);
  const members = mem ? (WORD_NUM[mem[1]] ?? Number(mem[1])) : undefined;

  const mine = /\b(my|mine|me|i)\b/.test(t) && ensNames.length === 0;

  return { ensNames, tokens, amount, leverage, schedule, percent, members, mine };
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
  if (p.mine) out.push("👤 my wallet");
  if (p.tokens.length) out.push(`🪙 ${p.tokens.join("/")}`);
  if (p.amount) out.push(`💰 ${p.amount.value.toLocaleString()} ${p.amount.unit}`);
  if (p.leverage) out.push(`⚡ ${p.leverage}x`);
  if (p.schedule) out.push(`🕑 ${p.schedule}`);
  if (p.percent !== undefined) out.push(`％ ${p.percent}%`);
  if (p.members) out.push(`👥 ${p.members}`);
  return out;
}
