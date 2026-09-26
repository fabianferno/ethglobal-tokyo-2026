import { Transaction } from "@mysten/sui/transactions";
import { z } from "zod";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import deployment from "@/lib/sui/deployment.json";
import { hasServerKeypair, serverAddress, serverKeypair, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const ABORTS: Record<number, string> = {
  0: "ENotAuthorized",
  1: "EExpired",
  2: "EOverTxCap",
  3: "EOverDayCap",
  4: "ERecipientNotAllowed",
  5: "ENotOwner",
  6: "EBadFee",
};

const body = z.object({ amountSui: z.number().positive().max(1).optional() });

/**
 * A real within-cap payment through the deployed AgentVault (server-signed demo path — the sponsored,
 * user-owned path is wired via the Signing dialog's `vault_pay` intent once Enoki is configured).
 * `agent_pay` succeeds under the cap and moves real SUI; over the cap it aborts (see /api/sui/rogue).
 */
export async function POST(request: Request) {
  const dep = deployment as { packageId?: string | null; demoVault?: string; demoCap?: string };
  if (!dep.packageId || !dep.demoVault || !dep.demoCap) return Response.json({ error: "AgentVault not deployed" }, { status: 503 });
  if (!hasServerKeypair()) return Response.json({ error: "Sui server wallet not configured" }, { status: 503 });
  const rl = rateLimit(`vaultpay:${clientKey(request)}`, 10, 60 * 1000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  const amountSui = parsed.success ? (parsed.data.amountSui ?? 0.01) : 0.01;
  const amount = BigInt(Math.round(amountSui * 1e9));

  const kp = serverKeypair();
  const sender = serverAddress();
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${dep.packageId}::vault::agent_pay`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [tx.object(dep.demoVault), tx.object(dep.demoCap), tx.pure.address(sender), tx.pure.u64(amount), tx.object("0x6")],
  });

  try {
    const bytes = await tx.build({ client: suiClient() });
    const digest = await tx.getDigest({ client: suiClient() });
    const { signature } = await kp.signTransaction(bytes);
    await suiClient().executeTransaction({ transaction: bytes, signatures: [signature] });
    try {
      await suiClient().waitForTransaction({ digest, timeout: 15_000 });
    } catch {
      /* finality lag is fine */
    }
    return Response.json({ ok: true, digest, amountSui, explorer: `https://suiscan.xyz/testnet/tx/${digest}` });
  } catch (e) {
    const message = (e as Error).message;
    const m = message.match(/abort code:\s*(\d+)/i);
    const code = m ? Number(m[1]) : null;
    return Response.json({ ok: false, aborted: code != null, code, name: code != null ? ABORTS[code] : undefined, message }, { status: 400 });
  }
}
