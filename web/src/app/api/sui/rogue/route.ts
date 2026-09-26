import { Transaction } from "@mysten/sui/transactions";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import deployment from "@/lib/sui/deployment.json";
import { serverAddress, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";

/** AgentVault abort codes → names (kept in sync with move/suica_vault/sources/vault.move). */
const ABORTS: Record<number, string> = {
  0: "ENotAuthorized",
  1: "EExpired",
  2: "EOverTxCap",
  3: "EOverDayCap",
  4: "ERecipientNotAllowed",
  5: "ENotOwner",
  6: "EBadFee",
};

/**
 * Demo the real "rogue agent → Move abort → BSOD" beat: build an over-cap `agent_pay` against the
 * deployed AgentVault. The cap check aborts during transaction resolution (before any funds move or
 * gas is spent), so we catch the on-chain `MoveAbort` and return its code for the OS to render a BSOD.
 */
export async function POST(request: Request) {
  const rl = rateLimit(`rogue:${clientKey(request)}`, 20, 60 * 1000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  const dep = deployment as { packageId?: string | null; demoVault?: string; demoCap?: string; demoPerTxCap?: string };
  if (!dep.packageId || !dep.demoVault || !dep.demoCap) {
    return Response.json({ error: "AgentVault not deployed — run `pnpm sui:publish` and create a demo vault" }, { status: 503 });
  }
  const sender = serverAddress();
  if (!sender) return Response.json({ error: "Sui server wallet not configured" }, { status: 503 });

  const overCap = (BigInt(dep.demoPerTxCap ?? "20000000") * 1000n).toString();
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${dep.packageId}::vault::agent_pay`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [tx.object(dep.demoVault), tx.object(dep.demoCap), tx.pure.address(sender), tx.pure.u64(overCap), tx.object("0x6")],
  });

  try {
    // Resolution dry-runs the Move call; an over-cap amount aborts here.
    await tx.build({ client: suiClient() });
    return Response.json({ aborted: false, note: "agent_pay resolved without aborting (unexpected)" });
  } catch (e) {
    const message = (e as Error).message;
    const m = message.match(/abort code:\s*(\d+)/i);
    const code = m ? Number(m[1]) : null;
    return Response.json({
      aborted: true,
      code,
      name: code != null ? ABORTS[code] : undefined,
      module: "vault",
      packageId: dep.packageId,
      overCap,
      perTxCap: dep.demoPerTxCap,
      message,
    });
  }
}
