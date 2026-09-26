import "server-only";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type { RealHolding, RealPortfolio } from "./types";

/**
 * Read-only mainnet portfolio for any ENS name: resolve the name on Ethereum mainnet, then read
 * balances + prices (with 7d/30d change) from Ethplorer. No keys needed (`freekey`); set
 * ETHPLORER_API_KEY for higher limits. Results are cached so a demo never hammers the API.
 */

const mainnetClient = createPublicClient({ chain: mainnet, transport: http(process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com") });

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; p: Promise<RealPortfolio> }>();

/** Below this a holding is dust and would only clutter the table / arena. */
const MIN_USD = 1;
const MAX_HOLDINGS = 24;

export async function resolveName(name: string): Promise<string> {
  if (isAddress(name)) return getAddress(name);
  const addr = await mainnetClient.getEnsAddress({ name: normalize(name) });
  if (!addr) throw new Error(`${name} doesn't resolve on Ethereum mainnet`);
  return addr;
}

type EthplorerToken = {
  balance: number;
  rawBalance?: string;
  tokenInfo: { symbol?: string; name?: string; decimals?: string | number; price?: false | { rate: number; diff?: number; diff7d?: number; diff30d?: number; volume24h?: number } };
};
type EthplorerInfo = {
  ETH: { balance: number; price?: { rate: number; diff?: number; diff7d?: number; diff30d?: number } };
  tokens?: EthplorerToken[];
  error?: { message: string };
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function holding(token: string, name: string, amount: number, price: { rate: number; diff?: number; diff7d?: number; diff30d?: number }): RealHolding {
  const value = amount * price.rate;
  const d30 = num(price.diff30d);
  // value now vs. the same holding priced 30 days ago
  const pnl30d = d30 === null || d30 <= -100 ? 0 : value - value / (1 + d30 / 100);
  return { token, name, amount, price: price.rate, value, change24h: num(price.diff), change7d: num(price.diff7d), change30d: d30, pnl30d };
}

async function load(name: string): Promise<RealPortfolio> {
  const address = await resolveName(name);
  const key = process.env.ETHPLORER_API_KEY || "freekey";
  const res = await fetch(`https://api.ethplorer.io/getAddressInfo/${address}?apiKey=${key}`, { cache: "no-store" });
  const j = (await res.json()) as EthplorerInfo;
  if (!res.ok || j.error) throw new Error(j.error?.message ?? `ethplorer ${res.status}`);

  const out: RealHolding[] = [];
  if (j.ETH?.price && j.ETH.balance > 0) out.push(holding("ETH", "Ether", j.ETH.balance, j.ETH.price));
  let unpriced = 0;
  const illiquid: RealHolding[] = [];
  for (const t of j.tokens ?? []) {
    const info = t.tokenInfo;
    if (!info?.price || !info.symbol) {
      unpriced++;
      continue;
    }
    const decimals = Number(info.decimals ?? 0);
    const amount = t.rawBalance ? Number(t.rawBalance) / 10 ** decimals : t.balance / 10 ** decimals;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const h = holding(info.symbol.slice(0, 12), (info.name ?? info.symbol).slice(0, 40), amount, info.price);
    // A price is only real if you could sell at it: airdropped memecoins show huge "values" on a few
    // hundred dollars of daily volume. Liquid = daily volume ≥ 10% of the holding, or ≥ $1M.
    const vol = info.price.volume24h ?? 0;
    if (h.value >= MIN_USD && vol < 1_000_000 && vol < h.value * 0.1) illiquid.push(h);
    else out.push(h);
  }
  const holdings = out
    .filter((h) => h.value >= MIN_USD)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_HOLDINGS);
  return {
    name,
    address,
    chain: "ethereum",
    holdings,
    totalUsd: holdings.reduce((a, h) => a + h.value, 0),
    pnl30d: holdings.reduce((a, h) => a + h.pnl30d, 0),
    unpriced,
    illiquid: { count: illiquid.length, usd: illiquid.reduce((a, h) => a + h.value, 0), top: illiquid.sort((a, b) => b.value - a.value).slice(0, 5).map((h) => h.token) },
    fetchedAt: Date.now(),
    source: "Ethereum mainnet · Ethplorer",
  };
}

export function realPortfolio(name: string): Promise<RealPortfolio> {
  const k = name.toLowerCase();
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = load(k);
  cache.set(k, { at: Date.now(), p });
  p.catch(() => cache.delete(k)); // don't cache failures
  return p;
}
