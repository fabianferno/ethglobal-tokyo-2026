import type { IconName } from "@/components/win99/Icon";

/**
 * The six data shapes. Functions produce them; shells render them.
 * Any shell × function pair works as long as the shell accepts a shape the function produces.
 */

export type Fmt = "usd" | "pct" | "num" | "text" | "token";

export type Table = {
  columns: { key: string; label: string; fmt?: Fmt }[];
  rows: Record<string, string | number>[];
  /** Optional totals row, same keys as rows. */
  total?: Record<string, string | number>;
};

export type TimeSeries = { label: string; unit: "usd" | "pct"; points: number[] };

export type ListShape = {
  items: { icon?: IconName; title: string; subtitle?: string; right?: string; tone?: "up" | "down" | "warn" }[];
};

export type GridCell = { mine: boolean; risk: number; label: string };
export type RiskyGrid = {
  asset: string;
  mark: number;
  /** Row = leverage, column = entry offset from mark. */
  leverage: number[];
  offsets: number[];
  cells: GridCell[][];
};

export type Gauge = {
  value: number; // 0..1
  label: string;
  caption: string;
  forecast?: { day: string; value: number }[];
};

export type Scene = {
  headline: string;
  verdict: string;
  lines: string[];
  stats: { label: string; value: string }[];
  stamps: string[];
};

/**
 * A serializable Sui intent attached to a proposal. When present, the fixed Signing dialog
 * builds a real transaction from it, sponsors it via Enoki, simulates it (showing real balance
 * changes), and on Approve signs + executes it. Absent → the proposal is a mock/paper action.
 * Kept intentionally small and serializable — it travels inside TxProposal through OS state.
 */
export type SuiTransfer = { to: string; amount: number };
/** Direct wallet-to-wallet payment from the signer's own coins. */
export type SuiPayIntent = {
  kind: "pay";
  /** Move coin type, e.g. 0x2::sui::SUI or the USDC type. */
  coinType: string;
  /** Ticker + decimals so the dialog can format base units without a chain read. */
  symbol: string;
  decimals: number;
  /** One or more recipients paid from the sender's coins (never from the sponsor's gas). */
  transfers: SuiTransfer[];
};
/** A capped spend through an app's AgentVault: `vault::agent_pay`. Over-cap → Move abort → BSOD. */
export type SuiVaultPayIntent = {
  kind: "vault_pay";
  packageId: string;
  vaultId: string;
  capId: string;
  coinType: string;
  symbol: string;
  decimals: number;
  recipient: string;
  amount: number;
};
/** A real swap through our mock AMM pool (SUI ↔ SUSD) — powers rebalance + DCA. */
export type SuiSwapIntent = {
  kind: "swap";
  packageId: string;
  poolId: string;
  /** The pool entry to call. */
  fn: "swap_sui_to_susd" | "swap_susd_to_sui";
  /** Input coin the signer pays from. */
  coinType: string;
  symbol: string;
  decimals: number;
  amount: number;
};
export type SuiIntent = SuiPayIntent | SuiVaultPayIntent | SuiSwapIntent;

export type TxProposal = {
  kind: string;
  summary: string;
  agent: string;
  to: string;
  amount: number;
  token: string;
  network: string;
  calls: string[];
  /** 0 safe … 2 risky (Jev score). */
  risk: number;
  notes: string[];
  /** When set, this proposal executes for real on Sui through the Signing dialog. */
  sui?: SuiIntent;
};

export type Action = { id: string; label: string; primary?: boolean; tx?: TxProposal };

export type Bundle = {
  title: string;
  subtitle: string;
  table?: Table;
  series?: TimeSeries;
  list?: ListShape;
  grid?: RiskyGrid;
  gauge?: Gauge;
  scene?: Scene;
  /** Key/value settings shown in an app's side panel (from parsed params). */
  settings?: { label: string; value: string }[];
  actions: Action[];
};

export type ShapeKey = "table" | "series" | "list" | "grid" | "gauge" | "scene";
