/**
 * Verify the Sui/Enoki setup: prints the Enoki app config (auth providers, allowed origins, enabled
 * networks) and the server wallet's on-chain balances. No secrets are printed.
 *
 *   pnpm sui:check
 */
process.loadEnvFile(".env.local");
import { EnokiClient } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "devnet" | "mainnet";
const GRPC = `https://fullnode.${NETWORK}.sui.io:443`;

async function main() {
  console.log(`network: ${NETWORK}\n`);

  const key = process.env.ENOKI_PRIVATE_KEY;
  if (!key) {
    console.log("✗ ENOKI_PRIVATE_KEY missing in .env.local");
  } else {
    try {
      const app = await new EnokiClient({ apiKey: key }).getApp();
      console.log("Enoki app config (getApp):");
      console.log(JSON.stringify(app, null, 2));
      const providers = (app as { authenticationProviders?: unknown[] }).authenticationProviders ?? (app as { allowedProviders?: unknown[] }).allowedProviders;
      console.log(`\n→ auth providers configured: ${Array.isArray(providers) && providers.length ? "YES" : "NO — add Google in the Enoki portal"}`);
    } catch (e) {
      console.log("✗ getApp failed:", (e as Error).message);
    }
  }

  const addr = process.env.SUI_ADDRESS;
  if (addr) {
    try {
      const { balances } = await new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC }).listBalances({ owner: addr });
      const summary = balances.map((b) => `${b.coinType.split("::").pop()}=${b.balance}`).join(", ") || "(empty — needs funding)";
      console.log(`\nServer wallet ${addr}\n  balances: ${summary}`);
    } catch (e) {
      console.log("\n✗ balance read failed:", (e as Error).message);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("check failed:", (e as Error).message);
  process.exit(1);
});
