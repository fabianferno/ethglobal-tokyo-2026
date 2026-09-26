"use client";

import { pct, usd } from "@/lib/chain/mock";
import type { AppManifest } from "@/lib/compose/compose";
import type { Bundle } from "@/lib/compose/shapes";
import { fetchPriceHistory } from "@/lib/portfolio/live";
import { chainsIn, protocolsIn, yieldToken, type MarketsReport, type PoolsReport, type YieldsReport } from "./types";

/**
 * Live DeFi analytics for the yield / lp / markets / market_mood apps. Same contract as
 * liveBundleFor: the instant mock renders first, this swaps in real numbers, null keeps the mock.
 */

const inflight = new Map<string, { at: number; p: Promise<unknown> }>();
function get<T>(path: string, ttl = 60_000): Promise<T> {
  const hit = inflight.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>;
  const p = fetch(path).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "unavailable");
    return j as T;
  });
  inflight.set(path, { at: Date.now(), p });
  p.catch(() => inflight.delete(path));
  return p;
}

const q = (o: Record<string, string>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
const big = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : usd(n));
const price = (v: number) => (v >= 1 ? +v.toFixed(2) : +v.toPrecision(4));
const r2 = (n: number) => +n.toFixed(2);
const project = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const chainLabel = (chains: string[]) => (chains.length ? chains.join(" + ") : "all chains");

export async function defiBundleFor(app: AppManifest, base: Bundle): Promise<Bundle | null> {
  const fn = app.fn as string;
  const tokens = app.params.tokens;
  const chains = chainsIn(app.prompt ?? "");
  try {
    if (fn === "yield") {
      const token = yieldToken(app.prompt ?? "", tokens);
      const projects = protocolsIn(app.prompt ?? "").join(",");
      return yieldBundle(base, await get<YieldsReport>(`/api/defi/yields?${q({ token, chains: chains.join(","), projects })}`, 5 * 60_000));
    }
    if (fn === "lp") {
      const [a, b] = tokens.length >= 2 ? tokens : [tokens[0] && tokens[0] !== "USDC" ? tokens[0] : "ETH", "USDC"];
      return poolsBundle(base, await get<PoolsReport>(`/api/defi/pools?${q({ a, b, chains: chains.join(",") })}`));
    }
    if (fn === "markets") {
      const token = tokens.find((t) => t !== "USDC") ?? tokens[0] ?? "ETH";
      return marketsBundle(base, await get<MarketsReport>(`/api/defi/markets?${q({ token, chains: chains.join(",") })}`, 2 * 60_000));
    }
    if (fn === "market_mood") {
      const token = tokens.find((t) => t !== "USDC") ?? "ETH";
      return moodBundle(base, await fetchPriceHistory(token, Math.min(365, Math.max(14, Math.ceil(app.params.days ?? 30)))));
    }
  } catch {
    return null;
  }
  return null;
}

/** "usdc yield across chains": the best rate per chain, the full ranking, and the best pool's 30-day APY. */
export function yieldBundle(base: Bundle, y: YieldsReport): Bundle {
  const top = y.pools[0];
  return {
    ...base,
    title: `${y.token} yields · live`,
    subtitle: `Best ${top.apy.toFixed(2)}% on ${project(top.project)} (${top.chain}) · median ${y.median.toFixed(2)}% across ${y.count} pools · ${chainLabel(y.chains)} · ${y.source}`,
    table: {
      columns: [
        { key: "chain", label: "Chain", fmt: "text" },
        { key: "project", label: "Protocol", fmt: "text" },
        { key: "symbol", label: "Pool", fmt: "text" },
        { key: "apy", label: "APY", fmt: "pct" },
        { key: "base", label: "Base", fmt: "pct" },
        { key: "reward", label: "Rewards", fmt: "pct" },
        { key: "d7", label: "7d Δ", fmt: "pct" },
        { key: "tvl", label: "TVL", fmt: "usd" },
      ],
      rows: y.pools.map((p) => ({ chain: p.chain, project: project(p.project), symbol: p.symbol, apy: r2(p.apy), base: r2(p.apyBase ?? 0), reward: r2(p.apyReward ?? 0), d7: r2(p.apy7dChange ?? 0), tvl: Math.round(p.tvlUsd) })),
    },
    series: y.history.length > 1 ? { label: `${project(top.project)} ${top.symbol} on ${top.chain}: APY, last ${y.history.length} days`, unit: "pct", points: y.history.map((h) => h.apy) } : undefined,
    gauge: { value: Math.max(0, Math.min(1, top.apy / 20)), label: `Best ${top.apy.toFixed(2)}%`, caption: `${project(top.project)} on ${top.chain} · TVL ${big(top.tvlUsd)}` },
    list: {
      items: y.bestPerChain.map((p) => ({ icon: "coin" as const, title: `${p.chain}: ${p.apy.toFixed(2)}%`, subtitle: `${project(p.project)} · ${p.symbol} · TVL ${big(p.tvlUsd)}`, right: p.apy7dChange === null ? "" : `${p.apy7dChange >= 0 ? "+" : ""}${p.apy7dChange.toFixed(2)} pts 7d`, tone: p.chain === top.chain ? ("up" as const) : undefined })),
    },
    settings: [
      { label: "Token", value: y.token },
      { label: "Chains", value: chainLabel(y.chains) },
      ...(y.projects.length ? [{ label: "Protocols", value: y.projects.map(project).join(", ") }] : []),
      { label: "Pools compared", value: String(y.count) },
      { label: "Data", value: `Live · ${y.source} · read-only` },
    ],
  };
}

/** "eth usdc liquidity": every pool for the pair across DEXes and chains, and where volume moved in the last 24h. */
export function poolsBundle(base: Bundle, p: PoolsReport): Bundle {
  const top = p.pools[0];
  const liq = p.pools.reduce((a, x) => a + x.liquidityUsd, 0);
  const vol = p.pools.reduce((a, x) => a + x.volume24h, 0);
  const buys = p.pools.reduce((a, x) => a + x.buys24h, 0);
  const sells = p.pools.reduce((a, x) => a + x.sells24h, 0);
  const byChain = new Map<string, { liq: number; vol: number; n: number }>();
  for (const x of p.pools) {
    const c = byChain.get(x.chain) ?? { liq: 0, vol: 0, n: 0 };
    byChain.set(x.chain, { liq: c.liq + x.liquidityUsd, vol: c.vol + x.volume24h, n: c.n + 1 });
  }
  return {
    ...base,
    title: `${p.pair} liquidity · live`,
    subtitle: `${p.pools.length} pools · ${big(liq)} liquidity · ${big(vol)} traded 24h · ${chainLabel(p.chains)} · ${p.source}`,
    table: {
      columns: [
        { key: "chain", label: "Chain", fmt: "text" },
        { key: "dex", label: "DEX", fmt: "text" },
        { key: "pool", label: "Pool", fmt: "text" },
        { key: "price", label: "Price", fmt: "usd" },
        { key: "liq", label: "Liquidity", fmt: "usd" },
        { key: "vol", label: "Vol 24h", fmt: "usd" },
        { key: "turn", label: "Turnover", fmt: "pct" },
        { key: "chg", label: "24h", fmt: "pct" },
        { key: "flow", label: "Buys/Sells", fmt: "text" },
      ],
      rows: p.pools.map((x) => ({
        chain: x.chain, dex: project(x.dex), pool: x.name, price: price(x.priceUsd), liq: Math.round(x.liquidityUsd), vol: Math.round(x.volume24h),
        turn: x.liquidityUsd ? +((x.volume24h / x.liquidityUsd) * 100).toFixed(0) : 0, chg: r2(x.change24h), flow: `${x.buys24h}/${x.sells24h}`,
      })),
      total: { chain: "TOTAL", liq: Math.round(liq), vol: Math.round(vol), flow: `${buys}/${sells}` },
    },
    series: p.hourly.length > 1 ? { label: `${top.name} on ${project(top.dex)} (${top.chain}): hourly volume, last 24h`, unit: "usd", points: p.hourly.map((h) => h.volume) } : undefined,
    gauge: { value: buys + sells ? buys / (buys + sells) : 0.5, label: `Buy pressure ${buys + sells ? Math.round((buys / (buys + sells)) * 100) : 50}%`, caption: `${buys.toLocaleString()} buys vs ${sells.toLocaleString()} sells in 24h` },
    list: {
      items: [...byChain.entries()].sort((a, b) => b[1].vol - a[1].vol).map(([chain, c]) => ({ icon: "pool" as const, title: `${chain}: ${big(c.vol)} 24h`, subtitle: `${c.n} pool${c.n === 1 ? "" : "s"} · ${big(c.liq)} liquidity`, right: vol ? `${Math.round((c.vol / vol) * 100)}% of volume` : "" })),
    },
    settings: [
      { label: "Pair", value: p.pair },
      { label: "Chains", value: chainLabel(p.chains) },
      { label: "Busiest pool", value: `${top.name} · ${project(top.dex)} (${top.chain})` },
      { label: "Data", value: `Live · ${p.source} · read-only` },
    ],
  };
}

/** "where should I sell my ETH": the same token on DEXes and CEXes, best price first. */
export function marketsBundle(base: Bundle, m: MarketsReport): Bundle {
  const best = m.venues[0];
  const worst = m.venues[m.venues.length - 1];
  const edge = ((best.priceUsd - worst.priceUsd) / worst.priceUsd) * 100;
  return {
    ...base,
    title: `Where to trade ${m.token} · live`,
    subtitle: `Best ${usd(best.priceUsd)} on ${best.venue} · ${edge.toFixed(2)}% above the lowest quote · ${m.venues.length} venues · ${m.source}`,
    table: {
      columns: [
        { key: "venue", label: "Venue", fmt: "text" },
        { key: "kind", label: "Type", fmt: "text" },
        { key: "pair", label: "Pair", fmt: "text" },
        { key: "price", label: "Price", fmt: "usd" },
        { key: "vsmid", label: "vs median", fmt: "pct" },
        { key: "vol", label: "Vol 24h", fmt: "usd" },
        { key: "depth", label: "Pool depth", fmt: "usd" },
        { key: "spread", label: "Spread", fmt: "pct" },
      ],
      rows: m.venues.map((v) => ({
        venue: project(v.venue), kind: v.kind, pair: v.pair, price: price(v.priceUsd), vsmid: +(((v.priceUsd - m.medianUsd) / m.medianUsd) * 100).toFixed(3),
        vol: Math.round(v.volume24h), depth: v.depthUsd === null ? "—" : Math.round(v.depthUsd), spread: v.spreadPct === null ? "—" : +v.spreadPct.toFixed(3),
      })),
    },
    series: undefined,
    gauge: { value: Math.max(0, Math.min(1, edge / 1)), label: `Spread across venues ${edge.toFixed(2)}%`, caption: `High ${usd(best.priceUsd)} (${best.venue}) · low ${usd(worst.priceUsd)} (${worst.venue})` },
    list: {
      items: [
        { icon: "coin", title: `Sell on ${project(best.venue)}`, subtitle: `${best.kind} · ${best.pair} · ${usd(best.priceUsd)}`, right: `+${edge.toFixed(2)}%`, tone: "up" },
        { icon: "coin", title: `Buy on ${project(worst.venue)}`, subtitle: `${worst.kind} · ${worst.pair} · ${usd(worst.priceUsd)}`, right: "lowest", tone: "down" },
        { icon: "info", title: `Median ${usd(m.medianUsd)}`, subtitle: "Quotes more than 1.5% off the median are dropped as stale" },
      ],
    },
    settings: [
      { label: "Token", value: m.token },
      { label: "DEX chains", value: chainLabel(m.chains) },
      { label: "Data", value: `Live · ${m.source} · read-only, prices before fees and slippage` },
    ],
  };
}

type History = Awaited<ReturnType<typeof fetchPriceHistory>>;

/** "how does ETH feel": realized volatility from real daily closes (no invented funding or liquidations). */
export function moodBundle(base: Bundle, h: History): Bundle {
  const rets = h.closes.slice(1).map(([, v], i) => Math.log(v / h.closes[i][1]));
  const sd = (xs: number[]) => {
    const m = xs.reduce((a, x) => a + x, 0) / (xs.length || 1);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
  };
  const annual = (xs: number[]) => sd(xs) * Math.sqrt(365) * 100;
  const vol30 = annual(rets);
  const vol7 = annual(rets.slice(-7));
  // 0 = calm (≤ 20% annualized), 1 = storm (≥ 120%)
  const v = Math.max(0, Math.min(1, (vol7 - 20) / 100));
  const worstDay = Math.min(...rets) * 100;
  const bestDay = Math.max(...rets) * 100;
  // Rolling 7-day volatility on each of the last 5 days (the Weather shell's strip).
  const days = h.closes.slice(-5).map(([t], i) => {
    const end = rets.length - 4 + i;
    return { day: new Date(t).toLocaleDateString("en", { weekday: "short" }), value: Math.max(0, Math.min(1, (annual(rets.slice(Math.max(0, end - 7), end)) - 20) / 100)) };
  });
  return {
    ...base,
    title: `${h.symbol} Market Weather · live`,
    subtitle: v > 0.7 ? "Storm warning: wild daily swings" : v > 0.4 ? "Choppy with scattered wicks" : v > 0.2 ? "Breezy, normal crypto weather" : "Calm, sunny, boring",
    gauge: { value: v, label: `Volatility ${vol7.toFixed(0)}% (7d, annualized)`, caption: `${h.symbol} ${usd(h.price)} · ${pct(h.change24h ?? 0)} 24h · 30d vol ${vol30.toFixed(0)}%`, forecast: days },
    series: { label: `${h.symbol} daily close, last ${h.days} days`, unit: "usd", points: h.closes.map(([, c]) => price(c)) },
    list: {
      items: [
        { icon: "info", title: `7-day volatility ${vol7.toFixed(0)}%`, subtitle: `30-day ${vol30.toFixed(0)}% · ${vol7 > vol30 ? "heating up" : "cooling down"}`, tone: vol7 > vol30 ? "warn" : "up" },
        { icon: "chart", title: `Worst day ${worstDay.toFixed(1)}%`, subtitle: `Best day +${bestDay.toFixed(1)}% (last ${h.days} days)`, tone: "down" },
        { icon: "coin", title: `${pct(h.changeWindow)} over ${h.days} days`, subtitle: `High ${usd(h.high)} · Low ${usd(h.low)}`, tone: h.changeWindow >= 0 ? "up" : "down" },
      ],
    },
    settings: [{ label: "Data", value: `Live · ${h.source} daily closes · realized volatility` }],
  };
}
