/**
 * Top up the demo AgentVault from the server wallet: vault::deposit<SUI>(demoVault, coin).
 *
 *   pnpm sui:topup          # 0.05 SUI
 *   pnpm sui:topup 0.2      # custom amount in SUI
 */
process.loadEnvFile(".env.local");
import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet";
const GRPC = `https://fullnode.${NETWORK}.sui.io:443`;
const SUI = "0x2::sui::SUI";

const { packageId: PKG, demoVault } = JSON.parse(readFileSync("src/lib/sui/deployment.json", "utf8")) as { packageId: string; demoVault?: string };
if (!PKG || !demoVault) throw new Error("deployment.json needs packageId + demoVault");

const amountSui = Number(process.argv[2] ?? "0.05");
if (!(amountSui > 0)) throw new Error(`bad amount: ${process.argv[2]}`);
const mist = BigInt(Math.round(amountSui * 1e9));

const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
const me = keypair.toSuiAddress();
const client = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC });

async function main() {
  const { balance } = await client.getBalance({ owner: me });
  console.log(`Server wallet ${me}\n  balance: ${Number(balance.balance) / 1e9} SUI`);
  if (BigInt(balance.balance) < mist + 10_000_000n) throw new Error("server wallet too low — fund it at faucet.sui.io first");

  const tx = new Transaction();
  tx.setSender(me);
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
  tx.moveCall({ target: `${PKG}::vault::deposit`, typeArguments: [SUI], arguments: [tx.object(demoVault), coin] });

  const bytes = await tx.build({ client });
  const digest = await tx.getDigest({ client });
  const { signature } = await keypair.signTransaction(bytes);
  await client.executeTransaction({ transaction: bytes, signatures: [signature] });
  await client.waitForTransaction({ digest, timeout: 15_000 }).catch(() => {});
  console.log(`Deposited ${amountSui} SUI into vault ${demoVault}\n  https://suiscan.xyz/${NETWORK}/tx/${digest}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
