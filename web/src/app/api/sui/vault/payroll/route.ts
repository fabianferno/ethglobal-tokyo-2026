import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import { toBaseUnits } from "@/lib/sui/config";
import deployment from "@/lib/sui/deployment.json";
import { hasServerKeypair, serverAddress, serverKeypair, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ABORTS: Record<number, string> = { 0: "ENotAuthorized", 1: "EExpired", 2: "EOverTxCap", 3: "EOverDayCap", 4: "ERecipientNotAllowed", 5: "ENotOwner", 6: "EBadFee" };

// Fallback demo "team" so "Run payroll" always shows a real on-chain batch even if no recipients resolved.
const DEMO_TEAM = [
  "0x00000000000000000000000000000000000000000000000000000000000000a1",
  "0x00000000000000000000000000000000000000000000000000000000000000a2",
  "0x00000000000000000000000000000000000000000000000000000000000000a3",
];

const body = z.object({
  recipients: z.array(z.string().min(3).max(80)).max(20).optional(),
  amountSui: z.number().positive().max(1).optional(),
});

/**
 * Programmable payroll: pay a whole team in ONE sponsored-style PTB of `agent_pay` calls from the
 * AgentVault. The AgentCap's per-tx / per-day caps are enforced ATOMICALLY — if the batch total blows
 * the daily cap, the offending call aborts and the WHOLE PTB reverts (no one gets paid twice, no
 * partial payroll) → surfaced as the BSOD. `fee_bps` routes a cut to the creator on each transfer.
 * Server-signed against the funded demo vault (the demo vault's AgentCap is server-owned).
 */
export async function POST(request: Request) {
  const dep = deployment as { packageId?: string | null; demoVault?: string; demoCap?: string };
  if (!dep.packageId || !dep.demoVault || !dep.demoCap) return Response.json({ error: "AgentVault not deployed" }, { status: 503 });
  if (!hasServerKeypair()) return Response.json({ error: "Sui server wallet not configured" }, { status: 503 });
  const rl = rateLimit(`payroll:${clientKey(request)}`, 6, 60 * 1000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const recipients = (parsed.data.recipients?.filter(isValidSuiAddress) ?? []);
  const team = recipients.length ? recipients : DEMO_TEAM;
  const amount = toBaseUnits(parsed.data.amountSui ?? 0.005, 9); // per-head SUI (demo-scale to fit the vault)

  const sender = serverAddress();
  const tx = new Transaction();
  tx.setSender(sender);
  // One PTB, one agent_pay per recipient — the cap accumulates across calls, so the batch is all-or-nothing.
  for (const to of team) {
    tx.moveCall({
      target: `${dep.packageId}::vault::agent_pay`,
      typeArguments: ["0x2::sui::SUI"],
      arguments: [tx.object(dep.demoVault), tx.object(dep.demoCap), tx.pure.address(to), tx.pure.u64(amount), tx.object("0x6")],
    });
  }

  try {
    const bytes = await tx.build({ client: suiClient() }); // over-cap aborts here (resolution dry-run)
    const digest = await tx.getDigest({ client: suiClient() });
    const { signature } = await serverKeypair().signTransaction(bytes);
    await suiClient().executeTransaction({ transaction: bytes, signatures: [signature] });
    try {
      await suiClient().waitForTransaction({ digest, timeout: 15_000 });
    } catch {
      /* finality lag ok */
    }
    return Response.json({ ok: true, digest, paid: team.length, amountSui: Number(amount) / 1e9, usedDemoTeam: recipients.length === 0, explorer: `https://suiscan.xyz/testnet/tx/${digest}` });
  } catch (e) {
    const message = (e as Error).message;
    const m = message.match(/abort code:\s*(\d+)/i);
    const code = m ? Number(m[1]) : null;
    return Response.json({ ok: false, aborted: code != null, code, name: code != null ? ABORTS[code] : undefined, paid: team.length, message }, { status: 400 });
  }
}
