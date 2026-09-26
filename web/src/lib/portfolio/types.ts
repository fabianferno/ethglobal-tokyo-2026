/**
 * Real, read-only portfolio for any ENS name or 0x address (mainnet EVM). Shared by the
 * /api/portfolio route and the client bundle builders. "Loss" here is always the honest,
 * labelled one: what the wallet's CURRENT holdings lost over the last 30 days of price moves —
 * not cost basis (we don't know what anyone paid).
 */

export type RealHolding = {
  token: string;
  name: string;
  amount: number;
  price: number;
  value: number;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  /** USD this holding gained (+) or lost (−) over 30 days of price change. */
  pnl30d: number;
};

export type RealPortfolio = {
  /** What was asked for (ENS name or address). */
  name: string;
  address: string;
  chain: "ethereum";
  holdings: RealHolding[];
  totalUsd: number;
  pnl30d: number;
  /** Tokens held whose price we couldn't read (usually airdropped spam). */
  unpriced: number;
  /** Priced but untradeable (daily volume far below the holding): airdrops, excluded from totals. */
  illiquid: { count: number; usd: number; top: string[] };
  fetchedAt: number;
  source: string;
};
