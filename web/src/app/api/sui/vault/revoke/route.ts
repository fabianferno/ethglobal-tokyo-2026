import { Transaction } from "@mysten/sui/transactions";
import { z } from "zod";
import { authSchema, verifyAction } from "@/lib/ens/auth";
import { isAppCreator } from "@/lib/ens/onchain";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import { capFor, DEMO_VAULT, forgetVault, vaultOf } from "@/lib/sui/agents";
import deployment from "@/lib/sui/deployment.json";
import { hasServerKeypair, serverAddress, serverKeypair, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ ens: z.string().min(3).max(120).regex(/^[a-z0-9.-]+$/), auth: authSchema });

/**
 * Task Manager "End Process": burn the app's AgentCap on Sui (`vault::revoke`), so its agent can
 * never spend from the vault again. Only the app's creator (device key that signed the mint) may.
 */
export async function POST(request: Request) {
  const dep = deployment as { packageId?: string | null };
  if (!dep.packageId || !hasServerKeypair()) return Response.json({ error: "AgentVault not configured" }, { status: 503 });
  const rl = rateLimit(`vaultrevoke:${clientKey(request)}`, 20, 60 * 60 * 1000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const { ens, auth } = parsed.data;

  let signer;
  try {
    signer = await verifyAction(auth, { action: "revoke", ens });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const vault = await vaultOf(ens);
  if (!vault) return Response.json({ ens, revoked: false, reason: "no Sui wallet" });
  if (vault === DEMO_VAULT) return Response.json({ error: "the shared demo vault can't be revoked" }, { status: 403 });
  if (!(await isAppCreator(ens, signer))) return Response.json({ error: `${signer} did not create ${ens}` }, { status: 403 });
  const cap = await capFor(vault);
  if (!cap) return Response.json({ ens, vault, revoked: false, reason: "AgentCap already revoked" });

  try {
    const tx = new Transaction();
    tx.setSender(serverAddress());
    tx.moveCall({ target: `${dep.packageId}::vault::revoke`, arguments: [tx.object(cap)] });
    const bytes = await tx.build({ client: suiClient() });
    const digest = await tx.getDigest({ client: suiClient() });
    const { signature } = await serverKeypair().signTransaction(bytes);
    await suiClient().executeTransaction({ transaction: bytes, signatures: [signature] });
    try {
      await suiClient().waitForTransaction({ digest, timeout: 15_000 });
    } catch {
      /* finality lag ok */
    }
    forgetVault(ens);
    return Response.json({ ens, vault, cap, revoked: true, digest, explorer: `https://suiscan.xyz/testnet/tx/${digest}` });
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[sui vault revoke]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
