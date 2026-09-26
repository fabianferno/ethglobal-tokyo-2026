import type { IconName } from "@/components/win99/Icon";
import { PRICES, pct, portfolioOf, priceHistory, rng, txHistory, usd } from "@/lib/chain/mock";
import type { Params } from "@/lib/intent/parse";
import type { ConcreteShell, FnKey, Vibe } from "@/lib/intent/types";
import type { Bundle, TxProposal } from "./shapes";

/**
 * Functions = crypto capabilities. Each one outputs data shapes and proposed transactions,
 * never UI. Values come from the parser (Params) and chain reads — never from Jev.
 */

export type FnCtx = {
  params: Params;
  /** Whose data we're looking at (ENS name). */
  target: string;
  /** The logged-in user. */
  owner: string;
  /** This app's own ENS name (the agent). */
  agent: string;
  vibe: Vibe;
  readOnly: boolean;
};

type FnDef = {
  label: string;
  icon: IconName;
  slug: string;
  defaultShell: ConcreteShell;
  blurb: (c: FnCtx) => string;
  build: (c: FnCtx) => Bundle;
};

const FRIENDS = ["kenji.eth", "yui.eth", "fabianferno.eth", "mika.eth", "sato.eth", "aiko.eth", "ren.eth", "hana.eth"];
const NET = "Sui Testnet";

function tx(c: FnCtx, p: Omit<TxProposal, "agent" | "network" | "notes" | "risk"> & Partial<Pick<TxProposal, "notes" | "risk">>): TxProposal {
  return { agent: c.agent, network: NET, notes: [], risk: 1, ...p };
}
function members(c: FnCtx, fallback = 4) {
  const n = Math.max(2, Math.min(8, c.params.members ?? fallback));
  const others = FRIENDS.filter((f) => f !== c.owner);
  return [c.owner, ...others.slice(0, n - 1)];
}
const amt = (c: FnCtx, d: number) => c.params.amount?.value ?? d;
const unit = (c: FnCtx, d = "USDC") => (c.params.amount?.unit === "USD" ? "USDC" : c.params.amount?.unit) ?? d;
const tok = (c: FnCtx, d = "SUI") => c.params.tokens.find((t) => t !== "USDC") ?? d;

export const FUNCTIONS: Record<FnKey, FnDef> = {
  portfolio: {
    label: "Portfolio",
    icon: "chart",
    slug: "portfolio",
    defaultShell: "excel",
    blurb: (c) => `Holdings and PnL of ${c.target}`,
    build: (c) => {
      const h = portfolioOf(c.target);
      const total = h.reduce((a, x) => a + x.value, 0);
      const pnl = h.reduce((a, x) => a + (x.price - x.costBasis) * x.amount, 0);
      return {
        title: `Portfolio — ${c.target}`,
        subtitle: `${h.length} assets · ${usd(total)}`,
        table: {
          columns: [
            { key: "token", label: "Asset", fmt: "text" },
            { key: "amount", label: "Amount", fmt: "num" },
            { key: "price", label: "Price", fmt: "usd" },
            { key: "value", label: "Value", fmt: "usd" },
            { key: "alloc", label: "Alloc", fmt: "pct" },
            { key: "change", label: "24h", fmt: "pct" },
            { key: "pnl", label: "PnL", fmt: "usd" },
          ],
          rows: h.map((x) => ({
            token: x.token,
            amount: +x.amount.toFixed(2),
            price: x.price,
            value: +x.value.toFixed(2),
            alloc: +((x.value / total) * 100).toFixed(1),
            change: x.change24h,
            pnl: +((x.price - x.costBasis) * x.amount).toFixed(2),
          })),
          total: { token: "TOTAL", value: +total.toFixed(2), alloc: 100, pnl: +pnl.toFixed(2) },
        },
        series: { label: "Net worth (30d)", unit: "usd", points: priceHistory(c.target) },
        list: { items: h.map((x) => ({ icon: "coin", title: x.token, subtitle: `${x.amount.toFixed(2)} @ ${usd(x.price)}`, right: usd(x.value), tone: x.change24h >= 0 ? "up" : "down" })) },
        actions: c.readOnly
          ? [{ id: "copy", label: "Copy this portfolio", primary: true, tx: tx(c, { kind: "Copy portfolio", summary: `Mirror ${c.target}'s allocation with 100 USDC`, to: "DeepBook v3", amount: 100, token: "USDC", calls: ["deepbook::pool::swap_exact_quote_for_base ×" + h.length] }) }]
          : [{ id: "rebal", label: "Rebalance…", primary: true, tx: tx(c, { kind: "Rebalance", summary: "Rebalance to target weights", to: "DeepBook v3", amount: Math.round(total * 0.08), token: "USDC", calls: ["deepbook::pool::swap_exact_base_for_quote", "deepbook::pool::swap_exact_quote_for_base"] }) }],
      };
    },
  },

  perps: {
    label: "Leverage Futures",
    icon: "bomb",
    slug: "perps",
    defaultShell: "minesweeper",
    blurb: (c) => `Leveraged ${tok(c)} perps${c.params.leverage ? ` up to ${c.params.leverage}x` : ""}`,
    build: (c) => {
      const asset = `${tok(c)}-PERP`;
      const mark = PRICES[tok(c)]?.price ?? 3.12;
      const maxLev = c.params.leverage ?? 20;
      const leverage = [2, 3, 5, 8, 10, 15, 20, 25, 40, 50].filter((l) => l <= Math.max(maxLev, 10)).slice(-8);
      const offsets = [-3, -2, -1, -0.5, 0.5, 1, 2, 3];
      const r = rng(c.agent + new Date().toISOString().slice(0, 13));
      const cells = leverage.map((l) =>
        offsets.map((o) => {
          const risk = Math.min(0.95, l / 45 + Math.abs(o) * 0.05 + r() * 0.15);
          return { mine: r() < risk * 0.55, risk, label: `${l}x ${o > 0 ? "long" : "short"} @ ${(mark * (1 + o / 100)).toFixed(3)}` };
        }),
      );
      return {
        title: `${asset} Sweeper`,
        subtitle: `Mark ${usd(mark)} · paper mode`,
        grid: { asset, mark, leverage, offsets, cells },
        gauge: { value: Math.min(1, maxLev / 50), label: "Degen meter", caption: `${maxLev}x max leverage` },
        settings: [
          { label: "Market", value: asset },
          { label: "Max leverage", value: `${maxLev}x` },
          { label: "Size", value: `${amt(c, 50)} ${unit(c)}` },
          { label: "Venue", value: "Bluefin (paper)" },
        ],
        actions: [
          { id: "long", label: `Open ${maxLev}x long`, primary: c.params.side !== "short", tx: tx(c, { kind: "Open perp", summary: `Open ${maxLev}x LONG ${tok(c)} · ${amt(c, 50)} ${unit(c)} margin (paper)`, to: "Bluefin (paper)", amount: amt(c, 50), token: unit(c), calls: [`perp::open_position(side=long, lev=${maxLev}x)`], risk: 1.5 }) },
          { id: "short", label: `Open ${maxLev}x short`, primary: c.params.side === "short", tx: tx(c, { kind: "Open perp", summary: `Open ${maxLev}x SHORT ${tok(c)} · ${amt(c, 50)} ${unit(c)} margin (paper)`, to: "Bluefin (paper)", amount: amt(c, 50), token: unit(c), calls: [`perp::open_position(side=short, lev=${maxLev}x)`], risk: 1.5 }) },
          { id: "close", label: "Close position", tx: tx(c, { kind: "Close perp", summary: `Close ${tok(c)} position (paper)`, to: "Bluefin (paper)", amount: 0, token: "—", calls: ["perp::close_position"], risk: 0.4 }) },
        ],
      };
    },
  },

  dca: {
    label: "DCA Bot",
    icon: "clock",
    slug: "dca",
    defaultShell: "explorer",
    blurb: (c) => `Buy ${amt(c, 10)} ${unit(c)} of ${tok(c)} ${c.params.schedule ?? "daily"}`,
    build: (c) => {
      const pts = priceHistory(c.agent, 20).map((v) => v / 1000);
      return {
        title: `DCA ${tok(c)}`,
        subtitle: `${amt(c, 10)} ${unit(c)} ${c.params.schedule ?? "daily"} via DeepBook`,
        series: { label: `${tok(c)} avg entry`, unit: "usd", points: pts },
        table: {
          columns: [{ key: "n", label: "#", fmt: "num" }, { key: "when", label: "When", fmt: "text" }, { key: "spend", label: "Spend", fmt: "usd" }, { key: "status", label: "Status", fmt: "text" }],
          rows: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, when: `T+${i} ${c.params.schedule ?? "daily"}`, spend: amt(c, 10), status: i === 0 ? "Next" : "Queued" })),
        },
        gauge: { value: 0.18, label: "Budget used", caption: `${amt(c, 10) * 2} of ${amt(c, 10) * 12} ${unit(c)}` },
        settings: [
          { label: "Buy", value: tok(c) },
          { label: "Amount", value: `${amt(c, 10)} ${unit(c)}` },
          { label: "Every", value: c.params.schedule ?? "day" },
          { label: "Skip if volatile", value: "Jev decides" },
        ],
        actions: [{ id: "start", label: "Start DCA", primary: true, tx: tx(c, { kind: "Create DCA vault", summary: `Deposit ${amt(c, 10) * 12} ${unit(c)}, buy ${tok(c)} ${c.params.schedule ?? "daily"}`, to: "AgentVault<USDC>", amount: amt(c, 10) * 12, token: unit(c), calls: ["agent_vault::create", "agent_vault::grant_cap(deepbook::swap, per_tx≤" + amt(c, 10) + ")"], risk: 0.8 }) }],
      };
    },
  },

  lp: {
    label: "Auto-LP",
    icon: "pool",
    slug: "lp",
    defaultShell: "explorer",
    blurb: (c) => `Managed ${c.params.tokens.join("/") || "SUI/USDC"} liquidity, auto-rebalanced`,
    build: (c) => {
      const pair = c.params.tokens.length >= 2 ? c.params.tokens.slice(0, 2).join("/") : `${tok(c)}/USDC`;
      return {
        title: `Auto-LP ${pair}`,
        subtitle: "Concentrated liquidity · rebalances when price nears the edge",
        gauge: { value: 0.62, label: "Price in range", caption: "62% across range — safe" },
        series: { label: "Fees earned", unit: "usd", points: priceHistory(c.agent + "lp", 20).map((v, i) => i * 1.7 + v / 900) },
        table: {
          columns: [{ key: "k", label: "Metric", fmt: "text" }, { key: "v", label: "Value", fmt: "text" }],
          rows: [
            { k: "Range", v: "$2.71 – $3.58" },
            { k: "TVL", v: "$48,210" },
            { k: "Fee APR", v: "31.4%" },
            { k: "Depositors", v: "37" },
            { k: "Creator fee", v: "0.5%" },
          ],
        },
        settings: [{ label: "Pool", value: `${pair} (Cetus)` }, { label: "Width", value: /tight/.test(c.params.tokens.join()) ? "Tight" : "Medium" }],
        actions: [{ id: "dep", label: "Deposit", primary: true, tx: tx(c, { kind: "Deposit to LP vault", summary: `Deposit ${amt(c, 100)} ${unit(c)} into ${pair} vault`, to: "AgentVault<LP>", amount: amt(c, 100), token: unit(c), calls: ["agent_vault::deposit", "cetus::pool::add_liquidity"] }) }],
      };
    },
  },

  yield: {
    label: "Yield Router",
    icon: "coin",
    slug: "yield",
    defaultShell: "explorer",
    blurb: () => "Keeps USDC at the best Sui lending rate",
    build: (c) => ({
      title: "Yield Router",
      subtitle: "Moves idle USDC to the best rate",
      table: {
        columns: [{ key: "p", label: "Protocol", fmt: "text" }, { key: "apy", label: "Supply APY", fmt: "pct" }, { key: "alloc", label: "Allocation", fmt: "pct" }, { key: "risk", label: "Risk", fmt: "text" }],
        rows: [
          { p: "Suilend", apy: 8.4, alloc: 50, risk: "Low" },
          { p: "Navi", apy: 7.9, alloc: 35, risk: "Low" },
          { p: "Scallop", apy: 6.2, alloc: 15, risk: "Med" },
        ],
      },
      gauge: { value: 0.84, label: "Blended APY", caption: "8.0% blended · max 50% per protocol" },
      actions: [{ id: "dep", label: "Deposit USDC", primary: true, tx: tx(c, { kind: "Deposit", summary: `Deposit ${amt(c, 250)} USDC into Yield Router`, to: "AgentVault<USDC>", amount: amt(c, 250), token: "USDC", calls: ["agent_vault::deposit", "suilend::lending_market::deposit"], risk: 0.5 }) }],
    }),
  },

  stake: {
    label: "Stake Club",
    icon: "flame",
    slug: "stake",
    defaultShell: "explorer",
    blurb: () => "Liquid-stake SUI and auto-compound",
    build: (c) => ({
      title: "Stake Club",
      subtitle: "Best liquid staking token, auto-compounded",
      table: {
        columns: [{ key: "lst", label: "LST", fmt: "text" }, { key: "apy", label: "APY", fmt: "pct" }, { key: "tvl", label: "TVL", fmt: "text" }],
        rows: [
          { lst: "afSUI (Aftermath)", apy: 3.4, tvl: "$210M" },
          { lst: "haSUI (Haedal)", apy: 3.3, tvl: "$160M" },
          { lst: "vSUI (Volo)", apy: 3.1, tvl: "$90M" },
        ],
      },
      actions: [{ id: "stake", label: "Stake SUI", primary: true, tx: tx(c, { kind: "Stake", summary: `Stake ${amt(c, 50)} SUI → afSUI`, to: "Aftermath LST", amount: amt(c, 50), token: "SUI", calls: ["aftermath::staked_sui_vault::request_stake"], risk: 0.4 }) }],
    }),
  },

  loan_guard: {
    label: "Loan Guard",
    icon: "lock",
    slug: "loan-guard",
    defaultShell: "explorer",
    blurb: () => "Auto top-up collateral before liquidation",
    build: (c) => ({
      title: "Loan Guard",
      subtitle: "Watching your Suilend position",
      gauge: { value: 0.41, label: "Health factor 1.41", caption: `Rescue below ${c.params.percent ? c.params.percent / 100 + 1 : 1.3}` },
      list: {
        items: [
          { icon: "info", title: "Health 1.41 — OK", subtitle: "2 min ago" },
          { icon: "warning", title: "SUI -6% in 1h", subtitle: "Jev: volatility high", tone: "warn" },
          { icon: "lock", title: "Rescued 120 USDC", subtitle: "Sep 21", tone: "up" },
        ],
      },
      actions: [{ id: "arm", label: "Arm guard", primary: true, tx: tx(c, { kind: "Grant AgentCap", summary: "Allow agent to repay up to 500 USDC/day", to: "AgentCap", amount: 500, token: "USDC", calls: ["agent_vault::grant_cap(suilend::repay, per_day≤500)"], risk: 0.6 }) }],
    }),
  },

  club: {
    label: "Investment Club",
    icon: "people",
    slug: "club",
    defaultShell: "explorer",
    blurb: (c) => `Group fund for ${members(c).length}, trades need votes`,
    build: (c) => {
      const m = members(c, 5);
      return {
        title: "Investment Club",
        subtitle: `${m.length} members · ${Math.ceil(m.length / 2) + 0} votes to pass`,
        list: {
          items: [
            { icon: "mail", title: "Buy 500 USDC of DEEP", subtitle: `from ${m[1]} · 3/${m.length} yes`, right: "Open" },
            { icon: "mail", title: "Stake 40% of SUI", subtitle: `from ${m[2] ?? m[0]} · passed`, right: "Done", tone: "up" },
            { icon: "mail", title: "Ape into CETUS 10x", subtitle: `from ${m[3] ?? m[0]} · Jev flagged: breaks rules`, right: "Blocked", tone: "down" },
          ],
        },
        table: { columns: [{ key: "m", label: "Member", fmt: "text" }, { key: "s", label: "Share", fmt: "pct" }], rows: m.map((x, i) => ({ m: x, s: +(100 / m.length + (i === 0 ? 2 : -2 / (m.length - 1))).toFixed(1) })) },
        actions: [{ id: "vote", label: "Vote YES on #1", primary: true, tx: tx(c, { kind: "Vote", summary: "Vote YES: Buy 500 USDC of DEEP", to: "club::proposal#1", amount: 0, token: "—", calls: ["club::vote(1, true)"], risk: 0.2 }) }],
      };
    },
  },

  split: {
    label: "Group Tab",
    icon: "people",
    slug: "grouptab",
    defaultShell: "explorer",
    blurb: (c) => `Shared tab for ${members(c).length} — settle in one tx`,
    build: (c) => {
      const m = members(c);
      const r = rng(c.agent);
      const bal = m.map(() => Math.round((r() - 0.5) * 120));
      bal[bal.length - 1] -= bal.reduce((a, b) => a + b, 0);
      return {
        title: "Group Tab",
        subtitle: `${m.length} people · settle in USDC`,
        table: { columns: [{ key: "who", label: "Member", fmt: "text" }, { key: "bal", label: "Balance", fmt: "usd" }], rows: m.map((who, i) => ({ who, bal: bal[i] })) },
        list: {
          items: [
            { icon: "document", title: "Izakaya dinner", subtitle: `paid by ${m[1]}`, right: "¥48,000" },
            { icon: "document", title: "Shinkansen tickets", subtitle: `paid by ${m[0]}`, right: "$412.00" },
            { icon: "document", title: "Karaoke", subtitle: `paid by ${m[2] ?? m[0]}`, right: "$96.00" },
          ],
        },
        actions: [
          { id: "join", label: "Join tab" },
          { id: "add", label: "Add bill" },
          { id: "settle", label: "Settle up", primary: true, tx: tx(c, { kind: "Settle group", summary: `Settle ${m.length} balances in one PTB (gas sponsored)`, to: m.slice(1).join(", "), amount: Math.abs(bal[0]) || 42, token: "USDC", calls: m.slice(1).map((x) => `0x2::pay::split_and_transfer → ${x}`), risk: 0.4 }) },
        ],
      };
    },
  },

  savings_circle: {
    label: "Tanomoshi",
    icon: "piggy",
    slug: "tanomoshi",
    defaultShell: "explorer",
    blurb: (c) => `Rotating savings: ${members(c, 6).length} × ${amt(c, 50)} USDC ${c.params.schedule ?? "monthly"}`,
    build: (c) => {
      const m = members(c, 6);
      return {
        title: "Tanomoshi 頼母子",
        subtitle: `${m.length} members · ${amt(c, 50)} ${unit(c)} ${c.params.schedule ?? "monthly"} · pot ${amt(c, 50) * m.length} ${unit(c)}`,
        table: { columns: [{ key: "turn", label: "Turn", fmt: "num" }, { key: "who", label: "Receives pot", fmt: "text" }, { key: "status", label: "Status", fmt: "text" }], rows: m.map((who, i) => ({ turn: i + 1, who, status: i < 2 ? "Paid out" : i === 2 ? "This round" : "Waiting" })) },
        gauge: { value: 3 / m.length, label: "Round progress", caption: `Round 3 of ${m.length}` },
        actions: [{ id: "pay", label: "Contribute", primary: true, tx: tx(c, { kind: "Contribute", summary: `Pay ${amt(c, 50)} ${unit(c)} into this round's pot`, to: "circle::pot", amount: amt(c, 50), token: unit(c), calls: ["circle::contribute"], risk: 0.3 }) }],
      };
    },
  },

  checkout: {
    label: "Checkout",
    icon: "shop",
    slug: "checkout",
    defaultShell: "explorer",
    blurb: () => "QR checkout, gasless for customers",
    build: (c) => ({
      title: "Checkout",
      subtitle: "Customers pay with Google login — no wallet, no gas",
      gauge: { value: 0.57, label: "Today's sales", caption: "$284 of $500 goal" },
      list: {
        items: [
          { icon: "coin", title: "Matcha latte", subtitle: "zkLogin · 10:24", right: "$6.50", tone: "up" },
          { icon: "coin", title: "2× Onigiri", subtitle: "zkLogin · 10:11", right: "$7.00", tone: "up" },
          { icon: "coin", title: "Tip", subtitle: "yui.eth · 09:58", right: "$2.00", tone: "up" },
        ],
      },
      actions: [{ id: "charge", label: "Charge $6.50", primary: true, tx: tx(c, { kind: "Payment request", summary: "Request 6.50 USDC (sponsored)", to: c.agent, amount: 6.5, token: "USDC", calls: ["checkout::request"], risk: 0.1 }) }],
    }),
  },

  subscription: {
    label: "Membership",
    icon: "ticket",
    slug: "members",
    defaultShell: "explorer",
    blurb: (c) => `${amt(c, 5)} USDC/month membership`,
    build: (c) => ({
      title: "Membership",
      subtitle: `${amt(c, 5)} ${unit(c)} / month`,
      table: { columns: [{ key: "t", label: "Tier", fmt: "text" }, { key: "p", label: "Price", fmt: "usd" }, { key: "n", label: "Members", fmt: "num" }], rows: [{ t: "Fan", p: amt(c, 5), n: 128 }, { t: "Supporter", p: amt(c, 5) * 3, n: 31 }, { t: "Patron", p: amt(c, 5) * 10, n: 4 }] },
      actions: [{ id: "sub", label: "Subscribe", primary: true, tx: tx(c, { kind: "Subscribe", summary: `Allow ${c.agent} to pull ${amt(c, 5)} ${unit(c)} monthly`, to: c.agent, amount: amt(c, 5), token: unit(c), calls: ["subscription::subscribe(per_month≤" + amt(c, 5) + ")"], risk: 0.3 }) }],
    }),
  },

  allowance: {
    label: "Family Wallet",
    icon: "piggy",
    slug: "family",
    defaultShell: "explorer",
    blurb: (c) => `Pocket money, ${amt(c, 20)} USDC ${c.params.schedule ?? "weekly"}, capped by Move`,
    build: (c) => ({
      title: "Family Wallet",
      subtitle: `${amt(c, 20)} ${unit(c)} ${c.params.schedule ?? "weekly"} · caps enforced on-chain`,
      table: { columns: [{ key: "k", label: "Kid", fmt: "text" }, { key: "cap", label: "Weekly cap", fmt: "usd" }, { key: "spent", label: "Spent", fmt: "usd" }], rows: [{ k: "hana.kids.eth", cap: amt(c, 20), spent: 12.5 }, { k: "ren.kids.eth", cap: amt(c, 20), spent: 19.9 }] },
      gauge: { value: 0.81, label: "Family spend", caption: "32.40 of 40 USDC this week" },
      actions: [{ id: "send", label: "Send allowance", primary: true, tx: tx(c, { kind: "Allowance", summary: `Send ${amt(c, 20)} ${unit(c)} to each kid`, to: "hana.kids.eth, ren.kids.eth", amount: amt(c, 20) * 2, token: unit(c), calls: ["allowance::top_up ×2"], risk: 0.2 }) }],
    }),
  },

  bounty: {
    label: "Bounty Board",
    icon: "ticket",
    slug: "bounties",
    defaultShell: "explorer",
    blurb: () => "Post bounties, pay winners in USDC",
    build: (c) => ({
      title: "Bounty Board",
      subtitle: "Prize money held in escrow until approved",
      list: {
        items: [
          { icon: "ticket", title: "Fix Minesweeper flag bug", subtitle: "claimed by kenji.eth", right: "$150" },
          { icon: "ticket", title: "Design 10 new icons", subtitle: "open", right: "$300" },
          { icon: "ticket", title: "Write Move tests", subtitle: "submitted by yui.eth", right: "$200", tone: "warn" },
        ],
      },
      actions: [{ id: "pay", label: "Approve & pay yui.eth", primary: true, tx: tx(c, { kind: "Bounty payout", summary: "Release 200 USDC to yui.eth", to: "yui.eth", amount: 200, token: "USDC", calls: ["bounty::approve(3)"], risk: 0.4 }) }],
    }),
  },

  escrow: {
    label: "Escrow Desk",
    icon: "lock",
    slug: "escrow",
    defaultShell: "explorer",
    blurb: () => "Hold payment until delivery, auto-release after deadline",
    build: (c) => ({
      title: "Escrow Desk",
      subtitle: "Funds locked until both sides are happy",
      table: { columns: [{ key: "d", label: "Deal", fmt: "text" }, { key: "a", label: "Amount", fmt: "usd" }, { key: "s", label: "Status", fmt: "text" }], rows: [{ d: "Logo design — aiko.eth", a: amt(c, 500), s: "Locked" }, { d: "Landing page — ren.eth", a: 1200, s: "Delivered" }] },
      actions: [{ id: "lock", label: "Lock funds", primary: true, tx: tx(c, { kind: "Escrow", summary: `Lock ${amt(c, 500)} ${unit(c)} for aiko.eth, release on approval or in 7 days`, to: "escrow::deal", amount: amt(c, 500), token: unit(c), calls: ["escrow::open(deadline=7d)"], risk: 0.5 }) }],
    }),
  },

  rsvp: {
    label: "RSVP",
    icon: "ticket",
    slug: "rsvp",
    defaultShell: "explorer",
    blurb: (c) => `Event sign-up, ${amt(c, 10)} USDC deposit refunded at check-in`,
    build: (c) => ({
      title: "RSVP",
      subtitle: `${amt(c, 10)} USDC deposit · no-shows pay the host`,
      table: { columns: [{ key: "g", label: "Guest", fmt: "text" }, { key: "s", label: "Status", fmt: "text" }], rows: FRIENDS.slice(0, 6).map((g, i) => ({ g, s: i < 3 ? "Checked in ✓" : "Deposit paid" })) },
      gauge: { value: 0.5, label: "Checked in", caption: "3 of 6" },
      actions: [{ id: "rsvp", label: "RSVP", primary: true, tx: tx(c, { kind: "RSVP deposit", summary: `Deposit ${amt(c, 10)} USDC, refunded at check-in`, to: c.agent, amount: amt(c, 10), token: "USDC", calls: ["rsvp::join"], risk: 0.2 }) }],
    }),
  },

  pay_per_call: {
    label: "Pay-per-call API",
    icon: "globe",
    slug: "api",
    defaultShell: "explorer",
    blurb: (c) => `Data API, ${c.params.amount?.value ?? 0.01} USDC per call — agents pay agents`,
    build: (c) => ({
      title: "Pay-per-call API",
      subtitle: `${c.params.amount?.value ?? 0.01} USDC per request`,
      series: { label: "Revenue", unit: "usd", points: priceHistory(c.agent + "api", 24).map((v, i) => i * 0.4 + v / 2000) },
      list: {
        items: [
          { icon: "agent", title: "dca.kenji.eth", subtitle: "GET /price/SUI", right: "+0.01", tone: "up" },
          { icon: "agent", title: "lp.mika.eth", subtitle: "GET /vol/SUI-USDC", right: "+0.01", tone: "up" },
          { icon: "agent", title: "0x9f…e1", subtitle: "Blocked: risky payer", right: "✕", tone: "down" },
        ],
      },
      actions: [],
    }),
  },

  roast: {
    label: "Portfolio Roast",
    icon: "flame",
    slug: "roast",
    defaultShell: "paint",
    blurb: (c) => `Roasts ${c.target}'s portfolio`,
    build: (c) => {
      const h = portfolioOf(c.target);
      const worst = [...h].sort((a, b) => a.price / a.costBasis - b.price / b.costBasis)[0];
      const total = h.reduce((a, x) => a + x.value, 0);
      const stable = (h.find((x) => x.token === "USDC")?.value ?? 0) / total;
      const txs = txHistory(c.target);
      const panic = txs.filter((t) => t.action === "Panic sold").length;
      const drawdown = (worst.price / worst.costBasis - 1) * 100;
      // Verdict is a closed set; later this is a Jev choice over the portfolio state.
      const verdict = drawdown < -30 ? "BAG HOLDER" : panic >= 2 ? "PAPER HANDS" : stable > 0.4 ? "SCARED MONEY" : h.length > 6 ? "SHITCOIN SOMMELIER" : "EXIT LIQUIDITY";
      return {
        title: `Roast of ${c.target}`,
        subtitle: verdict,
        scene: {
          headline: c.target.toUpperCase(),
          verdict,
          lines: [
            `bought ${worst.token} at ${usd(worst.costBasis)}. it's ${usd(worst.price)}. bold.`,
            panic ? `panic sold ${panic}× this month. diamond hands? cubic zirconia.` : `${h.length} tokens and not one of them is going anywhere.`,
            stable > 0.3 ? `${Math.round(stable * 100)}% in USDC. the bravest stablecoin holder alive.` : `only ${Math.round(stable * 100)}% in stables. risk management is a myth to you.`,
          ],
          stats: [
            { label: "Net worth", value: usd(total) },
            { label: "Worst bag", value: `${worst.token} ${pct(drawdown)}` },
            { label: "Panic sells", value: String(panic) },
          ],
          stamps: ["🤡", "📉", "🔥", "💎", "🧻"],
        },
        list: { items: txs.slice(0, 5).map((t) => ({ icon: "document", title: `${t.action} ${t.amount} ${t.token}`, subtitle: t.when, right: usd(t.pnl), tone: t.pnl >= 0 ? "up" : "down" })) },
        actions: [],
      };
    },
  },

  market_mood: {
    label: "Market Weather",
    icon: "weather",
    slug: "weather",
    defaultShell: "weather",
    blurb: (c) => `How ${tok(c)} feels right now`,
    build: (c) => {
      const r = rng(new Date().toISOString().slice(0, 13) + tok(c));
      const v = 0.2 + r() * 0.7;
      const days = ["Sat", "Sun", "Mon", "Tue", "Wed"];
      return {
        title: `${tok(c)} Market Weather`,
        subtitle: v > 0.7 ? "Liquidation storm warning" : v > 0.45 ? "Choppy with scattered wicks" : "Calm, sunny, boring",
        gauge: { value: v, label: `Volatility ${(v * 100).toFixed(0)}`, caption: `${tok(c)} ${usd(PRICES[tok(c)]?.price ?? 3.12)} · ${pct(PRICES[tok(c)]?.change24h ?? 0)} 24h`, forecast: days.map((day) => ({ day, value: Math.min(1, Math.max(0, v + (r() - 0.5) * 0.5)) })) },
        list: {
          items: [
            { icon: "info", title: "Funding rate +0.012%", subtitle: "Longs paying shorts" },
            { icon: "warning", title: "$18M liquidations near $2.95", subtitle: "Jev: anomaly unlikely", tone: "warn" },
          ],
        },
        actions: [],
      };
    },
  },

  journal: {
    label: "Trade Journal",
    icon: "notepad",
    slug: "journal",
    defaultShell: "notepad",
    blurb: (c) => `Trade diary of ${c.target}`,
    build: (c) => {
      const txs = txHistory(c.target, 14);
      return {
        title: `Trade journal — ${c.target}`,
        subtitle: `${txs.length} entries`,
        list: { items: txs.map((t) => ({ title: `${t.when}  ${t.action} ${t.amount} ${t.token}`, right: `PnL ${usd(t.pnl)}`, tone: t.pnl >= 0 ? "up" : "down" })) },
        table: { columns: [{ key: "when", label: "Date", fmt: "text" }, { key: "action", label: "Action", fmt: "text" }, { key: "token", label: "Token", fmt: "text" }, { key: "amount", label: "Amount", fmt: "num" }, { key: "pnl", label: "PnL", fmt: "usd" }], rows: txs },
        actions: [],
      };
    },
  },

  price_chart: {
    label: "Price Chart",
    icon: "chart",
    slug: "chart",
    defaultShell: "excel",
    blurb: (c) => `${tok(c, "ETH")} price over the last ${Math.min(365, Math.max(1, Math.ceil(c.params.days ?? 30)))} days`,
    build: (c) => {
      // Instant mock so the critical path stays LLM-free; the live route swaps in real closes
      // (same keys) for fn === "price_chart". Keys must match: series / gauge / table / list.
      const sym = tok(c, "ETH");
      const base = PRICES[sym]?.price ?? 100;
      const r = rng(c.agent + sym);
      const dec = base < 1 ? 6 : 2;
      let p = base * (0.82 + r() * 0.12);
      const n = Math.min(365, Math.max(2, Math.ceil(c.params.days ?? 30)));
      const closes = Array.from({ length: n }, () => {
        p = Math.max(base * 0.01, p * (1 + (r() - 0.47) * 0.06));
        return +p.toFixed(dec);
      });
      const first = closes[0];
      const last = closes[closes.length - 1];
      const move = (last / first - 1) * 100;
      const rows = closes
        .map((close, i) => ({ date: `T-${n - 1 - i}d`, close, chg: +(((close - (closes[i - 1] ?? close)) / (closes[i - 1] ?? close)) * 100).toFixed(2) }))
        .reverse();
      return {
        title: `${sym} Price Chart`,
        subtitle: `${sym} · ${usd(last)} · ${pct(move)} ${n}d`,
        series: { label: `${sym} daily close, last ${n} days`, unit: "usd", points: closes },
        gauge: { value: Math.max(0, Math.min(1, 0.5 + move / 100)), label: `${n}d ${pct(move)}`, caption: `${sym} ${usd(last)} · high ${usd(Math.max(...closes))} · low ${usd(Math.min(...closes))}` },
        table: {
          columns: [{ key: "date", label: "Date", fmt: "text" }, { key: "close", label: "Close", fmt: "usd" }, { key: "chg", label: "Day", fmt: "pct" }],
          rows,
        },
        list: { items: rows.slice(0, 6).map((x) => ({ icon: "coin", title: `${x.date}  ${usd(Number(x.close))}`, right: pct(Number(x.chg)), tone: Number(x.chg) >= 0 ? "up" : "down" })) },
        actions: [],
      };
    },
  },

  pay: {
    label: "Send Money",
    icon: "coin",
    slug: "pay",
    defaultShell: "explorer",
    blurb: () => "Send money to an ENS name or Sui address",
    build: (c) => {
      // Money never defaults: recipient + amount come only from the prompt. No recipient/amount → no Send.
      const to = c.params.ensNames[0] ?? c.params.addresses?.[0] ?? "";
      const short = to ? (to.length > 20 ? `${to.slice(0, 8)}…${to.slice(-4)}` : to) : "—";
      const token = unit(c);
      const amount = c.params.amount?.value ?? 0;
      const ready = !!to && amount > 0;
      return {
        title: "Send Money",
        subtitle: ready ? `Send ${amount} ${token} to ${short}` : "Who should I pay, and how much?",
        table: {
          columns: [{ key: "k", label: "Field", fmt: "text" }, { key: "v", label: "Value", fmt: "text" }],
          rows: [
            { k: "To", v: to ? short : "add a recipient (ENS or 0x)" },
            { k: "Amount", v: amount > 0 ? `${amount} ${token}` : "add an amount" },
            { k: "Network", v: "Sui Testnet" },
            { k: "Gas", v: "Sponsored — you pay nothing" },
          ],
        },
        list: { items: [{ icon: "coin", title: ready ? short : "No recipient yet", subtitle: "recipient", right: amount > 0 ? `${amount} ${token}` : "" }] },
        // Action id is EXACTLY "send" — AppFrame.runAction builds the real sponsored SuiPayIntent. Only
        // offered when a recipient AND amount are present, so the button can never show invented money.
        actions: ready ? [{ id: "send", label: `Send ${amount} ${token}`, primary: true, tx: tx(c, { kind: "Send payment", summary: `Send ${amount} ${token} to ${short} (gas sponsored)`, to, amount, token, calls: ["0x2::pay::split_and_transfer"], risk: 0.4 }) }] : [],
      };
    },
  },

  gas: {
    label: "Gas Tracker",
    icon: "clock",
    slug: "gas",
    defaultShell: "excel",
    blurb: () => "Live Ethereum + Sui gas prices",
    build: () => {
      const r = rng("gas" + new Date().toISOString().slice(0, 13));
      const pts = Array.from({ length: 24 }, () => +(0.3 + r() * 1.1).toFixed(2));
      const now = pts[pts.length - 1];
      return {
        title: "Gas Tracker",
        subtitle: `ETH base fee ~${now} gwei · Sui sponsored here`,
        series: { label: "ETH base fee (gwei, last 24 blocks)", unit: "usd", points: pts },
        gauge: { value: Math.max(0, Math.min(1, 1 - now / 60)), label: now < 15 ? "Cheap" : now < 30 ? "Normal" : "Pricey", caption: `${now} gwei now` },
        table: {
          columns: [{ key: "net", label: "Network", fmt: "text" }, { key: "what", label: "Action", fmt: "text" }, { key: "cost", label: "Cost", fmt: "usd" }],
          rows: [
            { net: "Ethereum", what: "Transfer", cost: +(now * 0.021 * 3.48).toFixed(2) },
            { net: "Ethereum", what: "Swap", cost: +(now * 0.15 * 3.48).toFixed(2) },
            { net: "Sui", what: "Transfer", cost: 0.001 },
            { net: "Sui", what: "Sponsored (here)", cost: 0 },
          ],
        },
        list: { items: [{ icon: "info", title: `ETH base fee ${now} gwei` }, { icon: "info", title: "Sui gas ≈ $0.001 · sponsored in Suica OS" }] },
        actions: [],
      };
    },
  },

  compare: {
    label: "Compare Wallets",
    icon: "people",
    slug: "vs",
    defaultShell: "excel",
    blurb: (c) => {
      const all = [...c.params.ensNames, ...(c.params.addresses ?? [])];
      return `${all[0] ?? c.owner} vs ${all[1] ?? "vitalik.eth"}`;
    },
    build: (c) => {
      const all = [...c.params.ensNames, ...(c.params.addresses ?? [])];
      const a = all[0] ?? c.owner;
      const b = all[1] ?? "vitalik.eth";
      const short = (x: string) => (x.length > 16 ? `${x.slice(0, 6)}…${x.slice(-4)}` : x);
      const ha = portfolioOf(a), hb = portfolioOf(b);
      const totA = ha.reduce((s, x) => s + x.value, 0), totB = hb.reduce((s, x) => s + x.value, 0);
      const tokens = [...new Set([...ha, ...hb].map((x) => x.token))];
      const val = (h: typeof ha, t: string) => +(h.find((x) => x.token === t)?.value ?? 0).toFixed(2);
      return {
        title: `${short(a)} vs ${short(b)}`,
        subtitle: `${usd(totA)} vs ${usd(totB)}`,
        table: {
          columns: [{ key: "token", label: "Token", fmt: "text" }, { key: "a", label: short(a), fmt: "usd" }, { key: "b", label: short(b), fmt: "usd" }],
          rows: tokens.map((t) => ({ token: t, a: val(ha, t), b: val(hb, t) })),
          total: { token: "TOTAL", a: +totA.toFixed(2), b: +totB.toFixed(2) },
        },
        list: { items: [{ icon: "agent", title: short(a), right: usd(totA) }, { icon: "agent", title: short(b), right: usd(totB), tone: totB >= totA ? "up" : "down" }] },
        settings: [{ label: "Wallet A", value: short(a) }, { label: "Wallet B", value: short(b) }],
        actions: [],
      };
    },
  },

  markets: {
    label: "Where to Trade",
    icon: "chart",
    slug: "markets",
    defaultShell: "excel",
    blurb: (c) => `Best place to sell or buy ${tok(c, "ETH")} across exchanges and chains`,
    // No sample prices: a made-up "best venue" is worse than a loading row. The live route fills it.
    build: (c) => ({
      title: `Where to trade ${tok(c, "ETH")}`,
      subtitle: "Fetching live quotes from DEXes and exchanges…",
      table: { columns: [{ key: "venue", label: "Venue", fmt: "text" }, { key: "price", label: "Price", fmt: "text" }], rows: [{ venue: "Loading live quotes…", price: "" }] },
      list: { items: [{ icon: "info", title: "Comparing DEX pools across chains and centralized exchanges", subtitle: "GeckoTerminal + CoinGecko, read-only" }] },
      actions: [],
    }),
  },

  none: {
    label: "Blank App",
    icon: "document",
    slug: "app",
    defaultShell: "explorer",
    blurb: () => "An empty agent",
    build: () => ({
      title: "New App",
      subtitle: "Describe what it should do",
      list: { items: [{ icon: "info", title: "Try: excel of vitalik.eth portfolio" }, { icon: "info", title: "Try: minesweeper but 20x SUI futures" }, { icon: "info", title: "Try: split bills with 4 friends" }] },
      actions: [],
    }),
  },
};
