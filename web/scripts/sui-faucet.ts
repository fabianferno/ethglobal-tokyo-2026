/**
 * Request testnet SUI from the public faucet to the Sui server wallet (for gas to publish/charge).
 * The public faucet is rate-limited per IP/address; if it 429s, wait and retry or use faucet.sui.io.
 *
 *   pnpm sui:faucet            # funds SUI_ADDRESS
 *   pnpm sui:faucet <address>  # funds a specific address
 */
process.loadEnvFile(".env.local");
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "devnet" | "mainnet";
const GRPC = `https://fullnode.${NETWORK}.sui.io:443`;

async function main() {
  const recipient = process.argv[2] || process.env.SUI_ADDRESS;
  if (!recipient) throw new Error("no recipient (pass an address or set SUI_ADDRESS)");
  console.log(`requesting ${NETWORK} SUI for ${recipient}…`);
  // The faucet only serves non-mainnet networks.
  const res = await requestSuiFromFaucetV2({ host: getFaucetHost(NETWORK as "testnet" | "devnet"), recipient });
  console.log("faucet response:", JSON.stringify(res).slice(0, 300));

  // Poll balance so we know when the coins land.
  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { balances } = await client.listBalances({ owner: recipient });
    const sui = balances.find((b) => b.coinType.endsWith("::sui::SUI"));
    if (sui && BigInt(sui.balance) > 0n) {
      console.log(`✓ funded: ${Number(BigInt(sui.balance)) / 1e9} SUI`);
      return;
    }
  }
  console.log("(coins not visible yet — check `pnpm sui:check` in a moment)");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("faucet failed:", (e as Error).message);
  if (/rate|429|limit/i.test((e as Error).message)) console.error("→ rate-limited; wait a bit or use the web faucet at faucet.sui.io");
  process.exit(1);
});
