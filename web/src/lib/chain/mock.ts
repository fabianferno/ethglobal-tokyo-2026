/**
 * Deterministic stand-in for chain reads until the ENS (Sepolia) + Sui (testnet) readers land.
 * Seeded by ENS name so the same name always shows the same portfolio across machines — which
 * matters for the "share an app, get the same data" demo beat.
 */

export function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PRICES: Record<string, { price: number; change24h: number }> = {
  SUI: { price: 3.12, change24h: -4.8 },
  USDC: { price: 1, change24h: 0 },
  DEEP: { price: 0.184, change24h: 11.2 },
  WAL: { price: 0.47, change24h: 2.1 },
  CETUS: { price: 0.121, change24h: -9.6 },
  ETH: { price: 3480, change24h: 1.4 },
  NAVX: { price: 0.066, change24h: -2.2 },
  AAPL: { price: 231.4, change24h: 0.6 },
};

export type Holding = { token: string; amount: number; price: number; value: number; change24h: number; costBasis: number };

export function portfolioOf(name: string): Holding[] {
  const r = rng(name);
  const picks = Object.keys(PRICES).filter(() => r() > 0.3);
  if (!picks.includes("SUI")) picks.unshift("SUI");
  return picks
    .map((token) => {
      const { price, change24h } = PRICES[token];
      const value = token === "ETH" ? 200 + r() * 4000 : 50 + r() * 3000;
      const amount = value / price;
      // Most people bought higher. That's the joke and, sadly, the data.
      const costBasis = price * (0.7 + r() * 0.9);
      return { token, amount, price, value, change24h, costBasis };
    })
    .sort((a, b) => b.value - a.value);
}

export function priceHistory(name: string, points = 30): number[] {
  const r = rng(name + ":hist");
  const out: number[] = [];
  let v = 1000 + r() * 4000;
  for (let i = 0; i < points; i++) {
    v *= 1 + (r() - 0.53) * 0.09;
    out.push(Math.round(v));
  }
  return out;
}

export type PastTx = { when: string; action: string; token: string; amount: number; pnl: number };

export function txHistory(name: string, n = 12): PastTx[] {
  const r = rng(name + ":tx");
  const actions = ["Bought", "Sold", "Swapped", "Staked", "Aped into", "Panic sold", "Bridged", "Claimed"];
  const tokens = ["SUI", "DEEP", "WAL", "CETUS", "NAVX", "ETH"];
  const out: PastTx[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 8, 25) - i * (1 + Math.floor(r() * 3)) * 86400000);
    out.push({
      when: d.toISOString().slice(0, 10),
      action: actions[Math.floor(r() * actions.length)],
      token: tokens[Math.floor(r() * tokens.length)],
      amount: Math.round(10 + r() * 900),
      pnl: Math.round((r() - 0.58) * 600),
    });
  }
  return out;
}

export function fakeDigest() {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from({ length: 44 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const usd = (v: number) =>
  (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 });
export const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
