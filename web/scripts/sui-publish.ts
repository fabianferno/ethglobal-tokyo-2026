/**
 * Publish the compiled AgentVault package to Sui — no Sui CLI needed. Reads the base64 bytecode from
 * move/suica_vault/compiled.json (produced by `pnpm sui:build`), publishes it signed by the server
 * keypair (SUI_PRIVATE_KEY), and writes the package id to src/lib/sui/deployment.json.
 *
 * Requires the Sui server wallet to hold a little testnet SUI for gas (faucet.sui.io).
 *
 *   pnpm sui:build && pnpm sui:publish
 */
process.loadEnvFile(".env.local");
import { readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "devnet" | "mainnet";
const GRPC = `https://fullnode.${NETWORK}.sui.io:443`;

async function main() {
  const sk = process.env.SUI_PRIVATE_KEY;
  if (!sk) throw new Error("SUI_PRIVATE_KEY missing in .env.local");
  const keypair = Ed25519Keypair.fromSecretKey(sk);
  const sender = keypair.toSuiAddress();
  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC });

  const compiled = JSON.parse(readFileSync("move/suica_vault/compiled.json", "utf8")) as { modules: string[]; dependencies: string[] };
  if (!compiled.modules?.length) throw new Error("compiled.json has no modules — run `pnpm sui:build` first");

  console.log(`Publishing suica_vault from ${sender} on ${NETWORK}…`);
  const tx = new Transaction();
  tx.setSender(sender);
  const [upgradeCap] = tx.publish({ modules: compiled.modules, dependencies: compiled.dependencies });
  tx.transferObjects([upgradeCap], sender);

  const bytes = await tx.build({ client });
  const digest = await tx.getDigest({ client });
  const { signature } = await keypair.signTransaction(bytes);
  await client.executeTransaction({ transaction: bytes, signatures: [signature] });
  try {
    await client.waitForTransaction({ digest, timeout: 15_000 });
  } catch {
    /* finality read may lag; the recovery below still works */
  }

  // The gRPC execute result doesn't surface objectChanges cleanly, so recover the packageId from the
  // UpgradeCap this tx created (it holds the published package id). Prefer the cap from THIS digest.
  const { objects } = (await client.listOwnedObjects({ owner: sender, include: { json: true, previousTransaction: true } as never } as never)) as unknown as {
    objects: { objectId: string; type?: string; previousTransaction?: string; json?: { package?: string } }[];
  };
  const caps = objects.filter((o) => o.type?.includes("package::UpgradeCap"));
  const cap = caps.find((o) => o.previousTransaction === digest) ?? caps[caps.length - 1];
  const packageId = cap?.json?.package ?? null;

  console.log(`\n✓ published. digest: ${digest}\n  packageId: ${packageId ?? "(not found — check the explorer)"}`);
  const deployment = { network: NETWORK, packageId, upgradeCap: cap?.objectId ?? null, digest, publishedAt: new Date().toISOString() };
  writeFileSync("src/lib/sui/deployment.json", JSON.stringify(deployment, null, 2) + "\n");
  console.log("wrote src/lib/sui/deployment.json");
  if (packageId) console.log(`  explorer: https://suiscan.xyz/${NETWORK}/object/${packageId}`);
  else console.log("⚠ Could not read packageId — set it manually in src/lib/sui/deployment.json from the explorer tx.");
}

main().then(() => process.exit(0)).catch((e) => {
  const msg = (e as Error).message;
  console.error("publish failed:", msg);
  if (/gas|balance|insufficient|InsufficientGas/i.test(msg)) console.error("→ The Sui server wallet likely needs testnet SUI for gas (faucet.sui.io).");
  process.exit(1);
});
