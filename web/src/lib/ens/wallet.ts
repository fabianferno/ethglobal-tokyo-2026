/**
 * Server-side Sepolia wallet (ENS minter). Only import from route handlers and scripts —
 * never from client components. The key comes from SEPOLIA_PRIVATE_KEY in .env.local.
 */
import { createPublicClient, createWalletClient, type Hex, http } from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

// Multicall batching: the index reads ~5 text records per name; unbatched, public RPCs rate-limit the burst.
export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC), batch: { multicall: true } });

/** eth_getLogs over the whole deployment range. Free-tier keyed RPCs (Alchemy: 10 blocks) can't do this, so it has its own URL. */
export const logsClient = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_LOGS_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com") });

let wallet: ReturnType<typeof makeWallet> | null = null;
function makeWallet() {
  const pk = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("SEPOLIA_PRIVATE_KEY missing or malformed in .env.local");
  // nonceManager: several mints can be in flight at once without nonce collisions.
  const account = privateKeyToAccount(pk, { nonceManager });
  return createWalletClient({ account, chain: sepolia, transport: http(RPC) });
}
export function serverWallet() {
  wallet ??= makeWallet();
  return wallet;
}
export const hasServerWallet = () => /^0x[0-9a-fA-F]{64}$/.test(process.env.SEPOLIA_PRIVATE_KEY ?? "");

export const etherscanTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;
