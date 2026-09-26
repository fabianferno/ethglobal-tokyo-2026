"use client";
/** Turn real Sui balances into a Portfolio Bundle, reusing the instant bundle's series/actions. */
import { PRICES } from "@/lib/chain/mock";
import type { Bundle } from "@/lib/compose/shapes";
import type { SuiBalance } from "./session";

export function enhancePortfolioBundle(base: Bundle, balances: SuiBalance[], target: string): Bundle {
  const priced = balances
    .map((b) => {
      const price = b.symbol === "USDC" ? 1 : (PRICES[b.symbol]?.price ?? 0);
      return { ...b, price, value: b.amount * price };
    })
    .sort((a, z) => z.value - a.value);
  const total = priced.reduce((a, x) => a + x.value, 0);

  const rows = priced.map((x) => ({
    token: x.symbol,
    amount: +x.amount.toFixed(4),
    price: x.price,
    value: +x.value.toFixed(2),
    alloc: total ? +((x.value / total) * 100).toFixed(1) : 0,
  }));

  return {
    ...base,
    title: `Portfolio — ${target} · live`,
    subtitle: priced.length ? `${priced.length} assets · $${total.toFixed(2)} · live from Sui` : "No Sui assets yet · live from Sui",
    table: {
      columns: [
        { key: "token", label: "Asset", fmt: "text" },
        { key: "amount", label: "Balance", fmt: "num" },
        { key: "price", label: "Price", fmt: "usd" },
        { key: "value", label: "Value", fmt: "usd" },
        { key: "alloc", label: "Alloc", fmt: "pct" },
      ],
      rows,
      total: rows.length ? { token: "TOTAL", value: +total.toFixed(2), alloc: 100 } : undefined,
    },
    list: {
      items: priced.length
        ? priced.map((x) => ({ icon: "coin" as const, title: x.symbol, subtitle: `${x.amount.toFixed(4)} on Sui`, right: `$${x.value.toFixed(2)}`, tone: "up" as const }))
        : [{ icon: "info" as const, title: "No Sui assets yet", subtitle: "Use ⚡ Charge in the Start menu to top up testnet USDC" }],
    },
  };
}
