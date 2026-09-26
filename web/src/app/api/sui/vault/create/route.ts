import { Transaction } from "@mysten/sui/transactions";
import { z } from "zod";
import { setSuiVault } from "@/lib/ens/onchain";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import deployment from "@/lib/sui/deployment.json";
import { hasServerKeypair, serverAddress, serverKeypair, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  ens: z.string().min(3).max(120).regex(/^[a-z0-9.-]+$/),
  feeBps: z.number().int().min(0).max(10000).optional(),
  perTxSui: z.number().positive().max(100).optional(),
  perDaySui: z.number().positive().max(1000).optional(),
});

/**
 * Give an app a real Sui wallet: create an `AgentVault<SUI>` on Sui (server-signed — the agent's
 * keys are server-side, bounded on-chain by the AgentCap per PRD §7), then write the vault's object
 * id into the app's ENS record at Sui coin type 784. After this, `<app>.suica.eth` resolves to its
 * on-chain vault (ENS × Sui). Call only after the app's mint has landed (its resolver must exist).
 */
export async function POST(request: Request) {
  const dep = deployment as { packageId?: string | null };
  if (!dep.packageId) return Response.json({ error: "AgentVault not deployed — run `pnpm sui:publish`" }, { status: 503 });
  if (!hasServerKeypair()) return Response.json({ error: "Sui server wallet not configured" }, { status: 503 });
  const rl = rateLimit(`vaultcreate:${clientKey(request)}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const { ens } = parsed.data;
  const feeBps = parsed.data.feeBps ?? 100;
  const perTx = BigInt(Math.round((parsed.data.perTxSui ?? 0.05) * 1e9));
  const perDay = BigInt(Math.round((parsed.data.perDaySui ?? 0.2) * 1e9));

  try {
    // 1. create_vault<SUI> — the AgentCap goes to the server (the app's agent runtime).
    const tx = new Transaction();
    tx.setSender(serverAddress());
    tx.moveCall({
      target: `${dep.packageId}::vault::create_vault`,
      typeArguments: ["0x2::sui::SUI"],
      arguments: [tx.pure.u16(feeBps), tx.pure.u64(perTx), tx.pure.u64(perDay), tx.pure.vector("address", []), tx.pure.u64(0n)],
    });
    const bytes = await tx.build({ client: suiClient() });
    const digest = await tx.getDigest({ client: suiClient() });
    const { signature } = await serverKeypair().signTransaction(bytes);
    await suiClient().executeTransaction({ transaction: bytes, signatures: [signature] });
    try {
      await suiClient().waitForTransaction({ digest, timeout: 15_000 });
    } catch {
      /* finality lag ok */
    }

    // 2. Recover the created AgentCap (owned by server, from this tx) → its vault_id.
    const { objects } = (await suiClient().listOwnedObjects({ owner: serverAddress(), include: { json: true, previousTransaction: true } as never } as never)) as unknown as {
      objects: { objectId: string; type?: string; previousTransaction?: string; json?: { vault_id?: string } }[];
    };
    const caps = objects.filter((o) => o.type?.includes("::vault::AgentCap"));
    const cap = caps.find((o) => o.previousTransaction === digest) ?? caps[caps.length - 1];
    const vaultId = cap?.json?.vault_id;
    if (!vaultId) return Response.json({ error: "created vault but could not read its id" }, { status: 500 });

    // 3. Write the vault id into the app's ENS record at coin type 784 (05's helper).
    let ensHash: string | null = null;
    let ensError: string | null = null;
    try {
      ensHash = (await setSuiVault(ens, vaultId)) as string;
    } catch (e) {
      ensError = (e as Error).message; // app not minted yet, or resolver missing — vault still exists
    }

    return Response.json({ ens, vaultId, capId: cap?.objectId ?? null, digest, ensWritten: !!ensHash, ensError, explorer: `https://suiscan.xyz/testnet/object/${vaultId}` });
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[sui vault create]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
