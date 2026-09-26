/** Shapes returned by /api/defi/* (live DeFi analytics). */

export type YieldPool = {
  chain: string;
  project: string;
  symbol: string;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  tvlUsd: number;
  /** APY change over 7 days, in percentage points. */
  apy7dChange: number | null;
  apyMean30d: number | null;
  pool: string;
};

export type YieldsReport = {
  token: string;
  chains: string[];
  projects: string[];
  pools: YieldPool[];
  bestPerChain: YieldPool[];
  /** The best pool's APY, last 30 days. */
  history: { t: number; apy: number }[];
  median: number;
  count: number;
  source: string;
  fetchedAt: number;
};

export type DexPool = {
  network: string;
  chain: string;
  dex: string;
  name: string;
  address: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24h: number;
  volume1h: number;
  change24h: number;
  buys24h: number;
  sells24h: number;
  traders24h: number;
};

export type PoolsReport = {
  pair: string;
  chains: string[];
  pools: DexPool[];
  /** Busiest pool, last 24 hours, oldest first. */
  hourly: { t: number; volume: number; close: number }[];
  source: string;
  fetchedAt: number;
};

export type MarketsReport = {
  token: string;
  chains: string[];
  /** Highest price first (best place to sell at the top). */
  venues: { venue: string; kind: "DEX" | "CEX"; pair: string; priceUsd: number; volume24h: number; depthUsd: number | null; spreadPct: number | null }[];
  medianUsd: number;
  source: string;
  fetchedAt: number;
};

/** Chain names people type, as DefiLlama spells them. */
const CHAINS: [RegExp, string][] = [
  [/\b(ethereum|mainnet|eth mainnet|l1)\b/, "Ethereum"],
  [/\bbase\b/, "Base"],
  [/\barbitrum|\barb\b/, "Arbitrum"],
  [/\boptimism\b/, "Optimism"],
  [/\bsui\b(?!\s*(price|token|coin))/, "Sui"],
  [/\bsolana\b/, "Solana"],
  [/\b(bsc|bnb chain|binance smart chain)\b/, "BSC"],
  [/\bpolygon\b/, "Polygon"],
  [/\bavalanche\b/, "Avalanche"],
  [/\bmonad\b/, "Monad"],
];
const PROTOCOLS = ["aave", "compound", "morpho", "spark", "euler", "fluid", "maker", "sky", "navi", "suilend", "scallop", "ember", "kamino", "pendle", "lido", "ethena", "uniswap", "curve", "aerodrome", "velodrome", "cetus", "bluefin", "turbos", "raydium", "orca", "jupiter", "gmx", "yearn", "convex", "venus", "radiant", "moonwell", "seamless"];
/** Protocols named in a prompt ("aave usdc yield"). "yield curve" is a chart, not the Curve protocol. */
export function protocolsIn(prompt: string): string[] {
  const t = prompt.toLowerCase().replace(/yield curves?/g, "");
  return PROTOCOLS.filter((p) => new RegExp(`\\b${p}\\b`).test(t));
}

/** The token a yield prompt is about: "stablecoin yield on sui" → USDC, not SUI (Sui is the chain there). */
export function yieldToken(prompt: string, tokens: string[]): string {
  const t = prompt.toLowerCase();
  const own = tokens.filter((k) => !new RegExp(`\\b(on|in) ${k.toLowerCase()}\\b`).test(t));
  if (/\bstable ?coins?\b|\bstables?\b|\bdollars?\b/.test(t) && !own.some((k) => /^(USDC|USDT|DAI|USDS|USDE|PYUSD)$/.test(k))) return "USDC";
  return own[0] ?? "USDC";
}

/** Chains named in a prompt ("usdc yield on base and arbitrum"). Empty = every chain. */
export function chainsIn(prompt: string): string[] {
  const t = prompt.toLowerCase();
  if (/\b(all|every|across|cross)[- ]?chains?\b|\bmulti[- ]?chain\b/.test(t)) return [];
  return CHAINS.filter(([re]) => re.test(t)).map(([, c]) => c);
}
