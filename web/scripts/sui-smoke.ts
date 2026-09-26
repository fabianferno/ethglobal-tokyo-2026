/**
 * Smoke-test the published AgentVault package on-chain with the server keypair (no Enoki needed):
 *   create_vault → deposit → agent_pay within cap (success) → agent_pay over cap (Move abort).
 * The abort proves the "rogue agent over cap → Move rejects → BSOD" beat and confirms the abort code.
 *
 *   pnpm sui:smoke
 */
process.loadEnvFile(".env.local");
import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet";
const GRPC = `https://fullnode.${NETWORK}.sui.io:443`;
const SUI = "0x2::sui::SUI";

const PKG = (JSON.parse(readFileSync("src/lib/sui/deployment.json", "utf8")) as { packageId: string }).packageId;
if (!PKG) throw new Error("no packageId in deployment.json — run pnpm sui:publish first");

const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
const me = keypair.toSuiAddress();
const client = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC });

const PER_TX = 20_000_000n; // 0.02 SUI
const PER_DAY = 50_000_000n; // 0.05 SUI
const DEPOSIT = 30_000_000n; // 0.03 SUI
const PAY_OK = 10_000_000n; // ≤ per-tx  → success
const PAY_OVER = 25_000_000n; // > per-tx → abort (EOverTxCap = 2)

async function run(label: string, tx: Transaction): Promise<{ digest: string; ok: boolean; err?: string }> {
  tx.setSender(me);
  try {
    // build() resolves + dry-runs against the client, so a Move abort surfaces HERE (before execute).
    const bytes = await tx.build({ client });
    const digest = await tx.getDigest({ client });
    const { signature } = await keypair.signTransaction(bytes);
    const res = (await client.executeTransaction({ transaction: bytes, signatures: [signature], include: { effects: true } as never })) as unknown as {
      effects?: { status?: { success?: boolean; error?: unknown } };
    };
    try {
      await client.waitForTransaction({ digest, timeout: 15_000 });
    } catch {}
    const st = res.effects?.status;
    const ok = st?.success !== false && !st?.error;
    console.log(`  ${label}: ${ok ? "OK" : "FAILED"} (${digest})${st?.error ? " · " + JSON.stringify(st.error) : ""}`);
    return { digest, ok, err: st?.error ? JSON.stringify(st.error) : undefined };
  } catch (e) {
    const msg = (e as Error).message;
    console.log(`  ${label}: REJECTED · ${msg}`);
    return { digest: "", ok: false, err: msg };
  }
}

async function ownedByTx(digest: string, typeSuffix: string) {
  const { objects } = (await client.listOwnedObjects({ owner: me, include: { json: true, previousTransaction: true } as never } as never)) as unknown as {
    objects: { objectId: string; type?: string; previousTransaction?: string; json?: Record<string, unknown> }[];
  };
  return objects.find((o) => o.type?.includes(typeSuffix) && o.previousTransaction === digest);
}

async function main() {
  console.log(`AgentVault smoke test on ${NETWORK}\n  package: ${PKG}\n  signer:  ${me}\n`);

  // 1. create_vault<SUI>(fee_bps=100, per_tx, per_day, allowed=[], expiry=0)
  const t1 = new Transaction();
  t1.moveCall({
    target: `${PKG}::vault::create_vault`,
    typeArguments: [SUI],
    arguments: [t1.pure.u16(100), t1.pure.u64(PER_TX), t1.pure.u64(PER_DAY), t1.pure.vector("address", []), t1.pure.u64(0n)],
  });
  const r1 = await run("create_vault", t1);
  if (!r1.ok) throw new Error("create_vault failed");
  const cap = await ownedByTx(r1.digest, "::vault::AgentCap");
  if (!cap) throw new Error("AgentCap not found after create_vault");
  const vaultId = cap.json?.vault_id as string;
  console.log(`  → vault: ${vaultId}\n  → cap:   ${cap.objectId}\n`);

  // 2. deposit<SUI>(vault, coin) — split the coin from gas
  const t2 = new Transaction();
  const [coin] = t2.splitCoins(t2.gas, [t2.pure.u64(DEPOSIT)]);
  t2.moveCall({ target: `${PKG}::vault::deposit`, typeArguments: [SUI], arguments: [t2.object(vaultId), coin] });
  await run("deposit 0.03 SUI", t2);

  // 3. agent_pay within cap (0.01 ≤ 0.02) → success
  const t3 = new Transaction();
  t3.moveCall({
    target: `${PKG}::vault::agent_pay`,
    typeArguments: [SUI],
    arguments: [t3.object(vaultId), t3.object(cap.objectId), t3.pure.address(me), t3.pure.u64(PAY_OK), t3.object("0x6")],
  });
  const r3 = await run("agent_pay 0.01 (within cap)", t3);

  // 4. agent_pay over cap (0.025 > 0.02) → Move abort EOverTxCap(2)
  const t4 = new Transaction();
  t4.moveCall({
    target: `${PKG}::vault::agent_pay`,
    typeArguments: [SUI],
    arguments: [t4.object(vaultId), t4.object(cap.objectId), t4.pure.address(me), t4.pure.u64(PAY_OVER), t4.object("0x6")],
  });
  const r4 = await run("agent_pay 0.025 (OVER cap)", t4);

  console.log(`\nRESULT:`);
  console.log(`  within-cap pay succeeded : ${r3.ok ? "✓" : "✗"}`);
  const aborted = !r4.ok && /abort code:\s*2|MoveAbort.*\b2\b/i.test(r4.err ?? "");
  console.log(`  over-cap pay aborted     : ${aborted ? "✓ (Move rejected it → BSOD trigger)" : "✗ — inspect: " + (r4.err ?? "unexpectedly succeeded")}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("smoke failed:", (e as Error).message);
  process.exit(1);
});
