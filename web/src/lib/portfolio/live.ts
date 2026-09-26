"use client";

import { pct, usd } from "@/lib/chain/mock";
import type { AppManifest } from "@/lib/compose/compose";
import type { Bundle } from "@/lib/compose/shapes";
import type { RealHolding, RealPortfolio } from "./types";

/**
 * Real read-only data for apps that look at someone else's wallet ("paint but roast vitalik.eth",
 * "doom but I'm shooting vitalik.eth's losses"). The instant mock bundle renders first; this swaps
 * in the real one when /api/portfolio answers. Returns null to keep the mock (not a real wallet,
 * a function we don't have real data for, or the read failed).
 */

const REAL_FNS = new Set(["portfolio", "roast"]);
const STABLES = new Set(["USDC", "USDT", "DAI", "USDS", "PYUSD", "FRAX", "LUSD", "GHO", "USDE", "TUSD", "FDUSD"]);

/** Is this target a real wallet we can read (not an app name, not a guest handle)? */
export function isRealWallet(target: string) {
  return (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(target) && !target.endsWith(".suica.eth")) || /^0x[0-9a-fA-F]{40}$/.test(target);
}

const inflight = new Map<string, Promise<RealPortfolio>>();
export function fetchRealPortfolio(name: string): Promise<RealPortfolio> {
  const k = name.toLowerCase();
  let p = inflight.get(k);
  if (!p) {
    p = fetch(`/api/portfolio?name=${encodeURIComponent(k)}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "portfolio unavailable");
      return j as RealPortfolio;
    });
    inflight.set(k, p);
    p.catch(() => inflight.delete(k));
    setTimeout(() => inflight.delete(k), 5 * 60_000);
  }
  return p;
}

type PriceHistory = { symbol: string; name: string; days: number; closes: [number, number][]; price: number; change24h: number | null; changeWindow: number; high: number; low: number; source: string };

const priceInflight = new Map<string, Promise<PriceHistory>>();
export function fetchPriceHistory(symbol: string, days = 30): Promise<PriceHistory> {
  const k = `${symbol}:${days}`;
  let p = priceInflight.get(k);
  if (!p) {
    p = fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}&days=${days}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "prices unavailable");
      return j as PriceHistory;
    });
    priceInflight.set(k, p);
    p.catch(() => priceInflight.delete(k));
    setTimeout(() => priceInflight.delete(k), 10 * 60_000);
  }
  return p;
}

/** "paint app with eth chart": real daily closes for the token the prompt names (default ETH). */
export function priceChartBundle(base: Bundle, h: PriceHistory): Bundle {
  const day = (t: number) => new Date(t).toISOString().slice(5, 10);
  const rows = h.closes.map(([t, v], i) => ({ date: day(t), close: r2p(v), change: i ? +(((v - h.closes[i - 1][1]) / h.closes[i - 1][1]) * 100).toFixed(2) : 0 }));
  return {
    ...base,
    title: `${h.symbol} price · live`,
    subtitle: `${usd(h.price)} · ${pct(h.changeWindow)} in ${h.days}d · ${h.source}`,
    series: { label: `${h.symbol} daily close, last ${h.days} days`, unit: "usd", points: h.closes.map(([, v]) => r2p(v)) },
    gauge: { value: Math.max(0, Math.min(1, 0.5 + h.changeWindow / 100)), label: `${h.symbol} ${pct(h.changeWindow)} (${h.days}d)`, caption: `High ${usd(h.high)} · Low ${usd(h.low)}` },
    table: {
      columns: [
        { key: "date", label: "Date", fmt: "text" },
        { key: "close", label: "Close", fmt: "usd" },
        { key: "change", label: "Day", fmt: "pct" },
      ],
      rows: [...rows].reverse(),
    },
    list: {
      items: [
        { icon: "coin", title: `${h.symbol} ${usd(h.price)}`, subtitle: h.change24h === null ? "" : `${pct(h.change24h)} today`, tone: (h.change24h ?? 0) >= 0 ? "up" : "down" },
        { icon: "chart", title: `${pct(h.changeWindow)} over ${h.days} days`, subtitle: `High ${usd(h.high)} · Low ${usd(h.low)}`, tone: h.changeWindow >= 0 ? "up" : "down" },
      ],
    },
  };
}
/** Prices keep precision below $1 (SUI 1.179, PEPE 0.0000123). */
const r2p = (v: number) => (v >= 1 ? +v.toFixed(2) : +v.toPrecision(4));

type GasReport = {
  eth: { baseGwei: number[]; tipGwei: number; nowGwei: number; transferUsd: number; swapUsd: number; ethUsd: number };
  sui: { referenceMist: number; epoch: number; transferSui: number; transferUsd: number; suiUsd: number };
  source: string;
};

/** "gas tracker": live Ethereum + Sui gas, and what it costs on Suica OS (nothing, it's sponsored). */
export function gasBundle(base: Bundle, g: GasReport): Bundle {
  const fmt = (v: number) => (v < 0.01 ? `$${v.toFixed(4)}` : usd(v));
  return {
    ...base,
    title: "Gas · live",
    subtitle: `Ethereum ${g.eth.nowGwei} gwei · Sui ${g.sui.referenceMist} MIST · ${g.source}`,
    series: { label: "Ethereum base fee (gwei), last 30 blocks", unit: "usd", points: g.eth.baseGwei },
    // 1 = dirt cheap (≤ 1 gwei), 0 = painful (≥ 50 gwei)
    gauge: { value: Math.max(0, Math.min(1, 1 - Math.log10(Math.max(1, g.eth.nowGwei)) / Math.log10(50))), label: `${g.eth.nowGwei} gwei`, caption: `ETH transfer ${fmt(g.eth.transferUsd)} · Sui transfer ${fmt(g.sui.transferUsd)}` },
    table: {
      columns: [
        { key: "network", label: "Network", fmt: "text" },
        { key: "what", label: "What", fmt: "text" },
        { key: "cost", label: "Cost now", fmt: "usd" },
      ],
      rows: [
        { network: "Ethereum", what: "ETH transfer (21k gas)", cost: g.eth.transferUsd },
        { network: "Ethereum", what: "DEX swap (~150k gas)", cost: g.eth.swapUsd },
        { network: "Sui", what: `Transfer (~${g.sui.transferSui} SUI)`, cost: g.sui.transferUsd },
        { network: "Suica OS", what: "Any app action (Enoki-sponsored)", cost: 0 },
      ],
    },
    list: {
      items: [
        { icon: "coin", title: `Ethereum ${g.eth.nowGwei} gwei`, subtitle: `base ${g.eth.baseGwei[g.eth.baseGwei.length - 1]} + tip ${g.eth.tipGwei}`, right: fmt(g.eth.transferUsd) },
        { icon: "coin", title: `Sui ${g.sui.referenceMist} MIST (epoch ${g.sui.epoch})`, subtitle: "reference gas price", right: fmt(g.sui.transferUsd) },
        { icon: "info", title: "On Suica OS you pay $0", subtitle: "gas is sponsored by Enoki", tone: "up" },
      ],
    },
  };
}

/** "compare vitalik.eth and nick.eth": both real portfolios, token by token. */
export function compareBundle(base: Bundle, a: RealPortfolio, b: RealPortfolio): Bundle {
  const tokens = [...new Set([...a.holdings, ...b.holdings].sort((x, y) => y.value - x.value).map((h) => h.token))].slice(0, 20);
  const val = (p: RealPortfolio, t: string) => r2(p.holdings.find((h) => h.token === t)?.value ?? 0);
  const [na, nb] = [who(a), who(b)];
  return {
    ...base,
    title: `${na} vs ${nb} · live`,
    subtitle: `${usd(a.totalUsd)} vs ${usd(b.totalUsd)} · 30d ${usd(a.pnl30d)} vs ${usd(b.pnl30d)}`,
    table: {
      columns: [
        { key: "token", label: "Asset", fmt: "text" },
        { key: "a", label: na, fmt: "usd" },
        { key: "b", label: nb, fmt: "usd" },
      ],
      rows: tokens.map((t) => ({ token: t, a: val(a, t), b: val(b, t) })),
      total: { token: "TOTAL", a: r2(a.totalUsd), b: r2(b.totalUsd) },
    },
    series: undefined,
    gauge: { value: a.totalUsd + b.totalUsd ? a.totalUsd / (a.totalUsd + b.totalUsd) : 0.5, label: `${na} share`, caption: `${na} ${usd(a.totalUsd)} · ${nb} ${usd(b.totalUsd)}` },
    list: {
      items: [a, b].map((p) => ({ icon: "agent" as const, title: who(p), subtitle: `${p.holdings.length} liquid assets · 30d ${usd(p.pnl30d)}`, right: usd(p.totalUsd), tone: p.pnl30d >= 0 ? ("up" as const) : ("down" as const) })),
    },
    settings: [
      { label: "Wallets", value: `${na} (${shortAddr(a.address)}) · ${nb} (${shortAddr(b.address)})` },
      { label: "Data", value: "Live · read-only · Ethereum mainnet" },
    ],
  };
}

let gasInflight: { at: number; p: Promise<GasReport> } | null = null;
function fetchGas(): Promise<GasReport> {
  if (gasInflight && Date.now() - gasInflight.at < 30_000) return gasInflight.p;
  const p = fetch("/api/gas").then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "gas unavailable");
    return j as GasReport;
  });
  gasInflight = { at: Date.now(), p };
  p.catch(() => (gasInflight = null));
  return p;
}

export async function liveBundleFor(app: AppManifest, base: Bundle): Promise<Bundle | null> {
  const fn = app.fn as string;
  if (fn === "gas") {
    try {
      return gasBundle(base, await fetchGas());
    } catch {
      return null;
    }
  }
  if (fn === "compare") {
    const extra = (app.params as { addresses?: string[] }).addresses ?? [];
    const wallets = [...new Set([app.target, ...app.params.ensNames, ...extra])].filter(isRealWallet).slice(0, 2);
    if (wallets.length < 2) return null;
    try {
      const [a, b] = await Promise.all(wallets.map(fetchRealPortfolio));
      return compareBundle(base, a, b);
    } catch {
      return null;
    }
  }
  if (fn === "price_chart") {
    const symbol = app.params.tokens.find((t) => t !== "USDC") ?? app.params.tokens[0] ?? "ETH";
    try {
      return priceChartBundle(base, await fetchPriceHistory(symbol));
    } catch {
      return null;
    }
  }
  if (!REAL_FNS.has(app.fn) || !isRealWallet(app.target)) return null;
  try {
    let p: RealPortfolio;
    try {
      p = await fetchRealPortfolio(app.target);
    } catch (e) {
      // Never show sample holdings under a real-looking name that doesn't exist.
      if (/resolve|invalid|not found/i.test((e as Error).message)) return notFoundBundle(base, app.target, (e as Error).message);
      throw e;
    }
    if (!p.holdings.length) return emptyBundle(base, p);
    return app.fn === "roast" ? roastBundle(base, p) : app.shell === "doom" ? lossesBundle(base, p) : portfolioBundle(base, p);
  } catch {
    return null;
  }
}

function notFoundBundle(base: Bundle, name: string, why: string): Bundle {
  return {
    ...base,
    title: `${name} · not found`,
    subtitle: why,
    table: { columns: [{ key: "note", label: "Result", fmt: "text" }], rows: [{ note: `${name} doesn't resolve on Ethereum mainnet, so there's nothing real to show.` }] },
    series: undefined,
    gauge: undefined,
    grid: undefined,
    scene: base.scene ? { headline: name.toUpperCase(), verdict: "WHO?", lines: ["this name doesn't resolve on ethereum.", "can't roast what doesn't exist.", "check the spelling?"], stats: [], stamps: ["❓"] } : undefined,
    list: { items: [{ icon: "warning", title: `${name} not found`, subtitle: why, tone: "warn" }] },
    actions: [],
  };
}

function emptyBundle(base: Bundle, p: RealPortfolio): Bundle {
  const junk = p.illiquid?.count ? ` · ${p.illiquid.count} illiquid airdrops (${usd(p.illiquid.usd)} on paper)` : "";
  return { ...base, title: `Portfolio — ${who(p)} · live`, subtitle: `No liquid tokens on Ethereum mainnet${junk}`, table: { columns: [{ key: "note", label: "Result", fmt: "text" }], rows: [{ note: "Empty wallet (or only dust / unsellable airdrops)." }] }, series: undefined, grid: undefined, list: { items: [{ icon: "info", title: "Nothing liquid here", subtitle: `${p.unpriced} unpriced tokens${junk}` }] }, actions: [] };
}

const valueAgo = (h: RealHolding, d: number | null) => (d === null || d <= -100 ? h.value : h.value / (1 + d / 100));
const r2 = (n: number) => +n.toFixed(2);

function netWorthSeries(p: RealPortfolio) {
  const sum = (f: (h: RealHolding) => number) => r2(p.holdings.reduce((a, h) => a + f(h), 0));
  return { label: "Net worth: 30d ago · 7d ago · 24h ago · now", unit: "usd" as const, points: [sum((h) => valueAgo(h, h.change30d)), sum((h) => valueAgo(h, h.change7d)), sum((h) => valueAgo(h, h.change24h)), r2(p.totalUsd)] };
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** "vitalik.eth" as-is; a raw 0x address shortened for titles. */
const who = (p: RealPortfolio) => (p.name.startsWith("0x") ? shortAddr(p.address) : p.name);

export function portfolioBundle(base: Bundle, p: RealPortfolio): Bundle {
  return {
    ...base,
    title: `Portfolio — ${who(p)} · live`,
    subtitle: `${p.holdings.length} assets · ${usd(p.totalUsd)} · 30d ${usd(p.pnl30d)} · ${p.source}`,
    table: {
      columns: [
        { key: "token", label: "Asset", fmt: "text" },
        { key: "amount", label: "Amount", fmt: "num" },
        { key: "price", label: "Price", fmt: "usd" },
        { key: "value", label: "Value", fmt: "usd" },
        { key: "alloc", label: "Alloc", fmt: "pct" },
        { key: "change", label: "30d", fmt: "pct" },
        { key: "pnl", label: "30d PnL", fmt: "usd" },
      ],
      rows: p.holdings.map((h) => ({
        token: h.token,
        amount: h.amount >= 1000 ? Math.round(h.amount) : r2(h.amount),
        price: h.price,
        value: r2(h.value),
        alloc: +((h.value / p.totalUsd) * 100).toFixed(1),
        change: h.change30d === null ? 0 : +h.change30d.toFixed(1),
        pnl: r2(h.pnl30d),
      })),
      total: { token: "TOTAL", value: r2(p.totalUsd), alloc: 100, pnl: r2(p.pnl30d) },
    },
    series: netWorthSeries(p),
    list: { items: p.holdings.map((h) => ({ icon: "coin", title: h.token, subtitle: `${h.name} · ${fmtAmt(h.amount)} @ ${usd(h.price)}`, right: usd(h.value), tone: (h.change30d ?? 0) >= 0 ? "up" : "down" })) },
    settings: [
      { label: "Wallet", value: `${p.name} (${shortAddr(p.address)})` },
      { label: "Chain", value: "Ethereum mainnet" },
      { label: "Unpriced tokens", value: String(p.unpriced) },
      ...(p.illiquid?.count ? [{ label: "Illiquid airdrops", value: `${p.illiquid.count} (${usd(p.illiquid.usd)} on paper, not counted)` }] : []),
      { label: "Data", value: "Live · read-only" },
    ],
  };
}

/** Losers only, biggest 30d dollar loss first: every row is a demon, its HP is the % it fell. */
export function lossesBundle(base: Bundle, p: RealPortfolio): Bundle {
  const losers = p.holdings.filter((h) => h.pnl30d < 0).sort((a, b) => a.pnl30d - b.pnl30d);
  const winnersShare = p.holdings.filter((h) => h.pnl30d >= 0).reduce((a, h) => a + h.value, 0) / (p.totalUsd || 1);
  const lost = losers.reduce((a, h) => a + h.pnl30d, 0);
  return {
    ...base,
    title: `Losses of ${who(p)} · live`,
    subtitle: losers.length ? `${losers.length} losing bags · ${usd(lost)} in 30 days` : "No losses this month. Suspicious.",
    table: {
      columns: [
        { key: "token", label: "Demon", fmt: "text" },
        { key: "drop", label: "30d drop", fmt: "pct" },
        { key: "loss", label: "Lost (30d)", fmt: "usd" },
        { key: "value", label: "Still holding", fmt: "usd" },
      ],
      rows: losers.map((h) => ({ token: h.token, drop: +Math.abs(h.change30d ?? 0).toFixed(1), loss: r2(h.pnl30d), value: r2(h.value) })),
      total: { token: "TOTAL", loss: r2(lost), value: r2(losers.reduce((a, h) => a + h.value, 0)) },
    },
    gauge: { value: Math.max(0, Math.min(1, winnersShare)), label: "Portfolio health", caption: `${Math.round(winnersShare * 100)}% of the bag is up this month` },
    list: { items: losers.map((h) => ({ icon: "bomb", title: h.token, subtitle: `${pct(h.change30d ?? 0)} in 30 days`, right: usd(h.pnl30d), tone: "down" })) },
    settings: [
      { label: "Wallet", value: `${p.name} (${shortAddr(p.address)})` },
      { label: "Loss", value: "30-day price change on current holdings" },
      { label: "Data", value: "Live · read-only" },
    ],
  };
}

export function roastBundle(base: Bundle, p: RealPortfolio): Bundle {
  const meaningful = p.holdings.filter((h) => h.value >= 10 && h.change30d !== null);
  const worst = [...meaningful].sort((a, b) => (a.change30d ?? 0) - (b.change30d ?? 0))[0] ?? p.holdings[0];
  const biggest = p.holdings[0];
  const stable = p.holdings.filter((h) => STABLES.has(h.token.toUpperCase())).reduce((a, h) => a + h.value, 0) / (p.totalUsd || 1);
  const losers = meaningful.filter((h) => (h.change30d ?? 0) < -20).length;
  const junkUsd = p.illiquid?.usd ?? 0;
  const verdict = p.unpriced > 500 || junkUsd > p.totalUsd ? "AIRDROP LANDFILL" : (worst.change30d ?? 0) < -40 ? "BAG HOLDER" : stable > 0.4 ? "SCARED MONEY" : p.holdings.length > 12 ? "SHITCOIN SOMMELIER" : p.pnl30d < 0 ? "EXIT LIQUIDITY" : "SUSPICIOUSLY FINE";
  return {
    ...base,
    title: `Roast of ${who(p)} · live`,
    subtitle: verdict,
    scene: {
      headline: who(p).toUpperCase(),
      verdict,
      lines: [
        `holds ${worst.token}: ${pct(worst.change30d ?? 0)} in 30 days. ${usd(worst.pnl30d)}. bold.`,
        junkUsd > p.totalUsd * 0.2 && p.illiquid ? `${usd(junkUsd)} "worth" of ${p.illiquid.top.slice(0, 3).join(", ")} that nobody will ever buy. rich on paper.` : p.unpriced > 50 ? `${p.unpriced.toLocaleString()} tokens so worthless nobody will even price them. a museum of airdrops.` : `${usd(biggest.value)} of ${biggest.token}. that's the whole personality.`,
        losers ? `${losers} bag${losers === 1 ? "" : "s"} down 20%+ this month. diamond hands? cubic zirconia.` : stable > 0.3 ? `${Math.round(stable * 100)}% in stables. the bravest stablecoin holder alive.` : `only ${Math.round(stable * 100)}% in stables. risk management is a myth to you.`,
      ],
      stats: [
        { label: "Net worth", value: usd(p.totalUsd) },
        ...(junkUsd ? [{ label: "Unsellable airdrops", value: usd(junkUsd) }] : []),
        { label: "30d PnL", value: usd(p.pnl30d) },
        { label: "Worst bag", value: `${worst.token} ${pct(worst.change30d ?? 0)}` },
      ],
      stamps: ["🤡", "📉", "🔥", "💎", "🧻"],
    },
    list: { items: [...meaningful].sort((a, b) => a.pnl30d - b.pnl30d).slice(0, 5).map((h) => ({ icon: "document", title: `${h.token} ${pct(h.change30d ?? 0)} (30d)`, subtitle: `${fmtAmt(h.amount)} held`, right: usd(h.pnl30d), tone: h.pnl30d >= 0 ? "up" : "down" })) },
  };
}

function fmtAmt(n: number) {
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(2);
}
