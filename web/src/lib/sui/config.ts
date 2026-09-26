/**
 * Sui network config — pure constants, safe to import from both client and server.
 * No secrets here: the Enoki key and the server keypair live in `server.ts` (server-only).
 *
 * Verified facts (2026-09-26, see docs/HANDOFF.md):
 * - Public fullnode JSON-RPC is deprecated ("migrate to gRPC or GraphQL"). Use gRPC.
 * - Circle testnet USDC coin type + 6 decimals verified via getCoinMetadata.
 */

export type SuiNetwork = "testnet" | "devnet" | "mainnet";

export const NETWORK: SuiNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) || "testnet";

/** gRPC fullnode (JSON-RPC is deprecated). Works from Node and the browser. */
export const GRPC_URL: Record<SuiNetwork, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
};
export const grpcUrl = () => GRPC_URL[NETWORK];

/** GraphQL endpoint (fallback for reads gRPC doesn't cover). */
export const GRAPHQL_URL: Record<SuiNetwork, string> = {
  testnet: "https://graphql.testnet.sui.io/graphql",
  devnet: "https://graphql.devnet.sui.io/graphql",
  mainnet: "https://graphql.mainnet.sui.io/graphql",
};

/** Coins we care about. `type` is the Move coin type; `decimals` matches getCoinMetadata. */
export const SUI_COIN = { type: "0x2::sui::SUI", symbol: "SUI", decimals: 9 } as const;

/** Circle testnet USDC (verified via getCoinMetadata). Only correct on testnet. */
export const USDC_COIN = {
  testnet: { type: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC", symbol: "USDC", decimals: 6 },
  devnet: { type: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC", symbol: "USDC", decimals: 6 },
  mainnet: { type: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", symbol: "USDC", decimals: 6 },
} as const;
export const usdcCoin = () => USDC_COIN[NETWORK];

/** Look up a coin's Move type + decimals by ticker, for the pay-intent builder. */
export function coinBySymbol(symbol: string): { type: string; symbol: string; decimals: number } {
  const s = symbol.toUpperCase();
  if (s === "SUI") return { ...SUI_COIN };
  return { ...usdcCoin() }; // default anything stable-ish (USD/USDC) to USDC
}

/** SLIP-44 coin type for Sui, used in ENSIP-9/11 multichain address records. */
export const SUI_ENS_COINTYPE = 784;

/** Human units → base units (bigint) and back, given decimals. */
export const toBaseUnits = (amount: number, decimals: number): bigint => BigInt(Math.round(amount * 10 ** decimals));
export const fromBaseUnits = (base: bigint | string, decimals: number): number => Number(BigInt(base)) / 10 ** decimals;

/* ── Explorer links (Suiscan) ─────────────────────────────── */
const SCAN: Record<SuiNetwork, string> = {
  testnet: "https://suiscan.xyz/testnet",
  devnet: "https://suiscan.xyz/devnet",
  mainnet: "https://suiscan.xyz/mainnet",
};
export const explorerTx = (digest: string) => `${SCAN[NETWORK]}/tx/${digest}`;
export const explorerObject = (id: string) => `${SCAN[NETWORK]}/object/${id}`;
export const explorerAddress = (addr: string) => `${SCAN[NETWORK]}/account/${addr}`;
