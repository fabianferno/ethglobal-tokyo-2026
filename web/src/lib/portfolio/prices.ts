import "server-only";

/**
 * Real daily price history for a token symbol (CoinGecko public API, no key). Cached, because the
 * free tier allows only a handful of calls a minute and a demo re-opens the same chart a lot.
 * Set COINGECKO_API_KEY (demo key) for higher limits.
 */

export type PriceHistory = {
  symbol: string;
  name: string;
  days: number;
  /** [unix ms, usd] daily closes, oldest first. */
  closes: [number, number][];
  price: number;
  change24h: number | null;
  changeWindow: number;
  high: number;
  low: number;
  source: string;
  fetchedAt: number;
};

/** Symbols we know → CoinGecko ids (anything else goes through /search). */
const IDS: Record<string, string> = {
  ETH: "ethereum", WETH: "weth", BTC: "bitcoin", WBTC: "wrapped-bitcoin", SUI: "sui", SOL: "solana", USDC: "usd-coin", USDT: "tether",
  DEEP: "deep", WAL: "walrus-2", CETUS: "cetus-protocol", NAVX: "navi", SCA: "scallop-2", ENS: "ethereum-name-service", DOGE: "dogecoin",
  PEPE: "pepe", LINK: "chainlink", UNI: "uniswap", ARB: "arbitrum", OP: "optimism", AVAX: "avalanche-2", BNB: "binancecoin", XRP: "ripple",
};

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; p: Promise<PriceHistory> }>();

function headers(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : {};
}

async function idFor(symbol: string): Promise<{ id: string; name: string }> {
  const known = IDS[symbol];
  if (known) return { id: known, name: symbol };
  const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`, { headers: headers() });
  const j = (await res.json()) as { coins?: { id: string; symbol: string; name: string }[] };
  const hit = j.coins?.find((c) => c.symbol.toUpperCase() === symbol) ?? j.coins?.[0];
  if (!hit) throw new Error(`unknown token ${symbol}`);
  return { id: hit.id, name: hit.name };
}

async function load(symbol: string, days: number): Promise<PriceHistory> {
  const { id, name } = await idFor(symbol);
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`, { headers: headers() });
  const j = (await res.json()) as { prices?: [number, number][]; status?: { error_message?: string } };
  if (!res.ok || !j.prices?.length) throw new Error(j.status?.error_message ?? `price history unavailable (${res.status})`);
  const closes = j.prices;
  const price = closes[closes.length - 1][1];
  const prev = closes.length > 1 ? closes[closes.length - 2][1] : null;
  const vals = closes.map((c) => c[1]);
  return {
    symbol,
    name: IDS[symbol] ? symbol : name,
    days,
    closes,
    price,
    change24h: prev ? ((price - prev) / prev) * 100 : null,
    changeWindow: ((price - closes[0][1]) / closes[0][1]) * 100,
    high: Math.max(...vals),
    low: Math.min(...vals),
    source: "CoinGecko",
    fetchedAt: Date.now(),
  };
}

export function priceHistory(symbol: string, days = 30): Promise<PriceHistory> {
  const k = `${symbol.toUpperCase()}:${days}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = load(symbol.toUpperCase(), days);
  cache.set(k, { at: Date.now(), p });
  p.catch(() => cache.delete(k));
  return p;
}
