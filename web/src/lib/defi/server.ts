import "server-only";

/**
 * Live DeFi analytics, read-only, from free public APIs (no keys):
 * - DefiLlama yields: lending / LP APYs across every chain, plus a pool's APY history.
 * - GeckoTerminal: DEX pools across chains (price, liquidity, 24h volume, buys/sells, hourly volume).
 * - CoinGecko tickers: the same token's price on centralized exchanges.
 * Every number shown comes from these APIs; nothing is generated.
 */

import type { DexPool, MarketsReport, PoolsReport, YieldPool, YieldsReport } from "./types";

const TTL = 5 * 60_000;
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
/** Last good answer per key: free APIs rate-limit (GeckoTerminal ~30/min), and stale data beats an empty window. */
const lastGood = new Map<string, unknown>();
function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>;
  const p = load().then(
    (v) => {
      if (lastGood.size > 300) lastGood.clear();
      lastGood.set(key, v);
      return v;
    },
    (e) => {
      memo.delete(key);
      if (lastGood.has(key)) return lastGood.get(key) as T;
      throw e;
    },
  );
  memo.set(key, { at: Date.now(), p });
  return p;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

/* ---------------- DefiLlama yields ---------------- */

type LlamaPool = {
  chain: string; project: string; symbol: string; tvlUsd: number; apy: number | null; apyBase: number | null; apyReward: number | null;
  pool: string; apyPct7D: number | null; apyMean30d: number | null; stablecoin: boolean; ilRisk: string; exposure: string; outlier: boolean;
};

// The full pool list is ~12 MB, so it's fetched once and kept in memory, then filtered per request.
const allPools = () =>
  cached("llama:pools", 10 * 60_000, async () => {
    const j = await getJson<{ data: LlamaPool[] }>("https://yields.llama.fi/pools");
    return j.data.filter((p) => p.apy !== null && p.apy > 0 && p.apy < 200 && !p.outlier && p.tvlUsd >= 1_000_000);
  });

const norm = (s: string) => s.toUpperCase().replace(/^W(ETH|BTC|SUI)$/, "$1");
/** A pool matches a token when it's that token alone ("USDC") or, for LPs, one side of it ("SUI-USDC"). */
const hasToken = (symbol: string, token: string) => symbol.toUpperCase().split(/[-/ ]+/).map(norm).includes(norm(token));

export function yields(token: string, chains: string[], projects: string[] = []): Promise<YieldsReport> {
  const key = `yields:${token}:${chains.join(",")}:${projects.join(",")}`;
  return cached(key, TTL, async () => {
    const want = chains.map((c) => c.toLowerCase());
    const pools = (await allPools()).filter((p) => (!want.length || want.includes(p.chain.toLowerCase())) && (!projects.length || projects.some((x) => p.project.startsWith(x))));
    const single = pools.filter((p) => p.exposure === "single" && norm(p.symbol) === norm(token));
    const matching = single.length >= 5 ? single : pools.filter((p) => hasToken(p.symbol, token));
    if (!matching.length) throw new Error(`no yield pools for ${token}${projects.length ? ` on ${projects.join(", ")}` : ""}${chains.length ? ` on ${chains.join(", ")}` : ""}`);
    // Rank by APY among pools big enough to matter; a $1M pool paying 90% is usually a reward farm about to end.
    const solid = matching.filter((p) => p.tvlUsd >= 5_000_000);
    const ranked = (solid.length >= 5 ? solid : matching).sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
    const toRow = (p: LlamaPool): YieldPool => ({
      chain: p.chain, project: p.project, symbol: p.symbol, apy: p.apy ?? 0, apyBase: p.apyBase, apyReward: p.apyReward, tvlUsd: p.tvlUsd,
      apy7dChange: p.apyPct7D, apyMean30d: p.apyMean30d, pool: p.pool,
    });
    // Best pool per chain = the cross-chain view.
    const perChain = new Map<string, LlamaPool>();
    for (const p of ranked) if (!perChain.has(p.chain)) perChain.set(p.chain, p);
    const top = ranked[0];
    // The best pool's APY over the last 30 days (the "yield curve" over time).
    let history: { t: number; apy: number }[] = [];
    try {
      const h = await getJson<{ data: { timestamp: string; apy: number }[] }>(`https://yields.llama.fi/chart/${top.pool}`);
      history = h.data.slice(-30).map((d) => ({ t: Date.parse(d.timestamp), apy: +d.apy.toFixed(2) }));
    } catch {
      /* the table is enough without the history */
    }
    const apys = matching.map((p) => p.apy ?? 0).sort((a, b) => a - b);
    return {
      token: token.toUpperCase(),
      chains,
      projects,
      pools: ranked.slice(0, 25).map(toRow),
      bestPerChain: [...perChain.values()].slice(0, 12).map(toRow),
      history,
      median: apys[Math.floor(apys.length / 2)] ?? 0,
      count: matching.length,
      source: "DefiLlama",
      fetchedAt: Date.now(),
    };
  });
}

/* ---------------- GeckoTerminal DEX pools ---------------- */

type GtPool = {
  id: string;
  attributes: {
    name: string; address: string; base_token_price_usd: string; quote_token_price_usd: string; reserve_in_usd: string;
    volume_usd: Record<"m5" | "h1" | "h6" | "h24", string>; price_change_percentage: Record<"h1" | "h24", string>;
    transactions: Record<"h1" | "h24", { buys: number; sells: number; buyers: number; sellers: number }>;
  };
  relationships: { dex: { data: { id: string } } };
};

const GT = "https://api.geckoterminal.com/api/v2";
const GT_HEADERS = { accept: "application/json;version=20230302" };
const NETWORK_NAMES: Record<string, string> = {
  eth: "Ethereum", base: "Base", arbitrum: "Arbitrum", optimism: "Optimism", "sui-network": "Sui", solana: "Solana", bsc: "BNB Chain",
  polygon_pos: "Polygon", avax: "Avalanche", monad: "Monad", near: "NEAR", thorchain: "THORChain", unichain: "Unichain", linea: "Linea",
  zksync: "zkSync", blast: "Blast", scroll: "Scroll", sonic: "Sonic", hyperevm: "HyperEVM", aptos: "Aptos", ton: "TON", tron: "Tron",
};
export const networkName = (id: string) => NETWORK_NAMES[id] ?? id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** GeckoTerminal ids for the chain names people type. */
const NETWORK_IDS: Record<string, string> = Object.fromEntries(Object.entries(NETWORK_NAMES).map(([id, n]) => [n.toLowerCase(), id]));

/** DEX tickers: ETH trades as WETH, BTC as WBTC/cbBTC. */
const DEX_SYMBOL: Record<string, string> = { ETH: "WETH", BTC: "WBTC" };
const same = (a: string, b: string) => norm(a) === norm(b) || (norm(b) === "BTC" && /^(WBTC|CBBTC|TBTC|BTCB)$/i.test(a));

export function pools(tokenA: string, tokenB: string, chains: string[]): Promise<PoolsReport> {
  const key = `pools:${tokenA}:${tokenB}:${chains.join(",")}`;
  return cached(key, 60_000, async () => {
    const q = `${DEX_SYMBOL[tokenA] ?? tokenA} ${DEX_SYMBOL[tokenB] ?? tokenB}`;
    const j = await getJson<{ data: GtPool[] }>(`${GT}/search/pools?query=${encodeURIComponent(q)}`, { headers: GT_HEADERS });
    const want = chains.map((c) => NETWORK_IDS[c.toLowerCase()] ?? c.toLowerCase());
    const list: DexPool[] = [];
    for (const p of j.data) {
      const network = p.id.split("_")[0];
      if (want.length && !want.includes(network)) continue;
      const [base, quote] = p.attributes.name.replace(/\s+[\d.]+%$/, "").split(" / ").map((s) => s.trim());
      const aIsBase = same(base, tokenA) && same(quote, tokenB);
      const aIsQuote = same(quote, tokenA) && same(base, tokenB);
      if (!aIsBase && !aIsQuote) continue;
      const a = p.attributes;
      const tx = a.transactions.h24;
      list.push({
        network, chain: networkName(network), dex: p.relationships.dex.data.id, name: a.name, address: a.address,
        priceUsd: Number(aIsBase ? a.base_token_price_usd : a.quote_token_price_usd),
        liquidityUsd: Number(a.reserve_in_usd), volume24h: Number(a.volume_usd.h24), volume1h: Number(a.volume_usd.h1),
        change24h: Number(a.price_change_percentage.h24), buys24h: tx.buys, sells24h: tx.sells, traders24h: tx.buyers + tx.sellers,
      });
    }
    if (!list.length) throw new Error(`no DEX pools for ${tokenA}/${tokenB}`);
    list.sort((x, y) => y.volume24h - x.volume24h);
    // A pool priced far from the busiest pools is a different token with the same ticker or a dead pool
    // with a stale reserve (these can report $100M+ "liquidity"). Keep pools within 3% of the busiest 3.
    const ref = list.slice(0, 3).map((x) => x.priceUsd).sort((a, b) => a - b)[Math.min(1, list.length - 1)];
    for (let i = list.length - 1; i >= 0; i--) if (Math.abs(list[i].priceUsd / ref - 1) > 0.03) list.splice(i, 1);
    // Hourly volume of the busiest pool for the last 24h = liquidity moving through it.
    let hourly: { t: number; volume: number; close: number }[] = [];
    try {
      const top = list[0];
      const o = await getJson<{ data: { attributes: { ohlcv_list: number[][] } } }>(`${GT}/networks/${top.network}/pools/${top.address}/ohlcv/hour?limit=24&currency=usd`, { headers: GT_HEADERS });
      hourly = o.data.attributes.ohlcv_list.map(([t, , , , c, v]) => ({ t: t * 1000, close: c, volume: Math.round(v) })).reverse();
    } catch {
      /* optional */
    }
    return { pair: `${tokenA}/${tokenB}`, chains, pools: list.slice(0, 20), hourly, source: "GeckoTerminal", fetchedAt: Date.now() };
  });
}

/* ---------------- Where to trade: DEX pools + CEX tickers ---------------- */

const CG_IDS: Record<string, string> = {
  ETH: "ethereum", BTC: "bitcoin", SUI: "sui", SOL: "solana", USDC: "usd-coin", USDT: "tether", DEEP: "deep", WAL: "walrus-2", CETUS: "cetus-protocol",
  LINK: "chainlink", UNI: "uniswap", ARB: "arbitrum", OP: "optimism", DOGE: "dogecoin", PEPE: "pepe", BNB: "binancecoin", XRP: "ripple", AVAX: "avalanche-2", ENS: "ethereum-name-service",
};
type CgTicker = { base: string; target: string; market: { name: string }; converted_last: { usd: number }; converted_volume: { usd: number }; bid_ask_spread_percentage: number | null; trust_score: string | null; is_anomaly: boolean; is_stale: boolean };

export function markets(token: string, chains: string[]): Promise<MarketsReport> {
  return cached(`markets:${token}:${chains.join(",")}`, 2 * 60_000, async () => {
    const quote = token === "USDC" ? "USDT" : "USDC";
    const [dex, cex] = await Promise.allSettled([
      pools(token, quote, chains),
      (async () => {
        const id = CG_IDS[token];
        if (!id) return [];
        const key = process.env.COINGECKO_API_KEY;
        const j = await getJson<{ tickers: CgTicker[] }>(`https://api.coingecko.com/api/v3/coins/${id}/tickers?order=volume_desc`, { headers: key ? { "x-cg-demo-api-key": key } : {} });
        return j.tickers.filter((t) => !t.is_anomaly && !t.is_stale && /^(USDT|USDC|USD|FDUSD)$/.test(t.target) && t.converted_volume.usd > 1_000_000);
      })(),
    ]);
    const venues: MarketsReport["venues"] = [];
    if (dex.status === "fulfilled")
      for (const p of dex.value.pools.filter((p) => p.liquidityUsd > 1_000_000 && p.volume24h > 100_000).slice(0, 10))
        venues.push({ venue: `${p.dex} (${p.chain})`, kind: "DEX", pair: p.name, priceUsd: p.priceUsd, volume24h: p.volume24h, depthUsd: p.liquidityUsd, spreadPct: null });
    if (cex.status === "fulfilled") {
      const seen = new Set<string>();
      for (const t of cex.value) {
        if (seen.has(t.market.name)) continue;
        seen.add(t.market.name);
        venues.push({ venue: t.market.name, kind: "CEX", pair: `${t.base}/${t.target}`, priceUsd: t.converted_last.usd, volume24h: t.converted_volume.usd, depthUsd: null, spreadPct: t.bid_ask_spread_percentage });
        if (seen.size >= 10) break;
      }
    }
    if (!venues.length) throw new Error(`no markets found for ${token}`);
    const prices = venues.map((v) => v.priceUsd).sort((a, b) => a - b);
    const mid = prices[Math.floor(prices.length / 2)];
    // Drop quotes more than 1.5% off the median: stale or thin books, not real opportunities.
    const clean = venues.filter((v) => Math.abs(v.priceUsd / mid - 1) < 0.015);
    return { token, chains, venues: clean.sort((a, b) => b.priceUsd - a.priceUsd), medianUsd: mid, source: "GeckoTerminal + CoinGecko", fetchedAt: Date.now() };
  });
}
