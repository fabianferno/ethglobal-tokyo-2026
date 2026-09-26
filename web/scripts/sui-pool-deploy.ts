/**
 * Publish the suica_pool package (mock SUSD coin + AMM pool), then seed a SUI/SUSD pool with
 * liquidity, and record ids in src/lib/sui/pool-deployment.json. No Sui CLI needed.
 *
 *   pnpm sui:build suica_pool && pnpm exec tsx scripts/sui-pool-deploy.ts
 */
process.loadEnvFile(".env.local");
import { readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet";
const GRPC = `https://fullnode.${NETWORK}.sui.io:443`;
const PRICE_MICRO = 3_000_000; // 3.00 SUSD per SUI
const SEED_SUI = 100_000_000n; // 0.1 SUI into the pool
const SEED_SUSD = 100_000_000_000n; // 100,000 SUSD (6dp) into the pool

const kp = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
const me = kp.toSuiAddress();
const client = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC });

async function signExec(tx: Transaction): Promise<string> {
  tx.setSender(me);
  const bytes = await tx.build({ client });
  const digest = await tx.getDigest({ client });
  const { signature } = await kp.signTransaction(bytes);
  await client.executeTransaction({ transaction: bytes, signatures: [signature] });
  try {
    await client.waitForTransaction({ digest, timeout: 20_000 });
  } catch {}
  return digest;
}

async function owned(): Promise<{ objectId: string; type?: string; previousTransaction?: string; json?: Record<string, unknown> }[]> {
  const { objects } = (await client.listOwnedObjects({ owner: me, include: { json: true, previousTransaction: true } as never } as never)) as unknown as {
    objects: { objectId: string; type?: string; previousTransaction?: string; json?: Record<string, unknown> }[];
  };
  return objects;
}

async function main() {
  const compiled = JSON.parse(readFileSync("move/suica_pool/compiled.json", "utf8")) as { modules: string[]; dependencies: string[] };

  console.log("1) publishing suica_pool…");
  const pubTx = new Transaction();
  const [cap] = pubTx.publish({ modules: compiled.modules, dependencies: compiled.dependencies });
  pubTx.transferObjects([cap], me);
  const pubDigest = await signExec(pubTx);

  const afterPub = await owned();
  const upgradeCap = afterPub.filter((o) => o.type?.includes("package::UpgradeCap")).find((o) => o.previousTransaction === pubDigest);
  const packageId = upgradeCap?.json?.package as string | undefined;
  if (!packageId) throw new Error("could not recover packageId from publish");
  const susdType = `${packageId}::susd::SUSD`;
  console.log(`   packageId: ${packageId}`);

  // Find the minted SUSD coin (owned, from the publish tx).
  const susdCoin = afterPub.find((o) => o.type === `0x2::coin::Coin<${susdType}>` && o.previousTransaction === pubDigest) ?? afterPub.find((o) => o.type?.includes(`Coin<${susdType}>`));
  if (!susdCoin) throw new Error(`minted SUSD coin not found (type Coin<${susdType}>)`);
  console.log(`   SUSD coin: ${susdCoin.objectId}`);

  console.log("2) create_pool (seed 0.1 SUI + 100k SUSD @ 3.0)…");
  const poolTx = new Transaction();
  const [suiSeed] = poolTx.splitCoins(poolTx.gas, [poolTx.pure.u64(SEED_SUI)]);
  const [susdSeed] = poolTx.splitCoins(poolTx.object(susdCoin.objectId), [poolTx.pure.u64(SEED_SUSD)]);
  poolTx.moveCall({ target: `${packageId}::pool::create_pool`, arguments: [suiSeed, susdSeed, poolTx.pure.u64(PRICE_MICRO)] });
  const poolDigest = await signExec(poolTx);

  // Recover the shared Pool id from the tx's created objects.
  const tx = (await client.getTransaction({ digest: poolDigest, include: { effects: true, objectTypes: true } as never } as never)) as unknown as {
    effects?: { changedObjects?: { objectId?: string; idOperation?: string; outputState?: string; objectType?: string; owner?: unknown }[]; created?: { objectId?: string; reference?: { objectId?: string } }[] };
    objectTypes?: Record<string, string>;
  };
  let poolId: string | null = null;
  const dump = JSON.stringify(tx).slice(0, 1500);
  const changed = tx.effects?.changedObjects ?? [];
  for (const c of changed) {
    const t = c.objectType ?? (c.objectId && tx.objectTypes?.[c.objectId]) ?? "";
    if (typeof t === "string" && t.includes("::pool::Pool")) poolId = c.objectId ?? null;
  }
  if (!poolId) {
    // fallback: match any created id against getObject type
    const created = (tx.effects?.created ?? []).map((c) => c.objectId ?? c.reference?.objectId).filter(Boolean) as string[];
    for (const id of created) {
      try {
        const o = (await client.getObject({ objectId: id })) as unknown as { object?: { type?: string } };
        if (o.object?.type?.includes("::pool::Pool")) { poolId = id; break; }
      } catch {}
    }
  }

  const dep = { network: NETWORK, packageId, susdType, poolId, priceMicro: PRICE_MICRO, publishDigest: pubDigest, poolDigest };
  writeFileSync("src/lib/sui/pool-deployment.json", JSON.stringify(dep, null, 2) + "\n");
  console.log(`3) poolId: ${poolId ?? "(NOT FOUND — inspect below)"}`);
  if (!poolId) console.log("   tx dump:", dump);
  console.log("wrote src/lib/sui/pool-deployment.json");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("pool deploy failed:", (e as Error).message);
  process.exit(1);
});
