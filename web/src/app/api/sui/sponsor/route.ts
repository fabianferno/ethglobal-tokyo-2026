import { fromBase64, isValidSuiAddress, toBase64 } from "@mysten/sui/utils";
import { z } from "zod";
import { NETWORK } from "@/lib/sui/config";
import { enokiClient, hasEnoki, suiClient } from "@/lib/sui/server";
import { allowedFor, allowedTargets, buildIntentTx } from "@/lib/sui/tx";

export const runtime = "nodejs";
export const maxDuration = 30;

const coinFields = { coinType: z.string().min(3).max(300), symbol: z.string().max(12), decimals: z.number().int().min(0).max(18) };
const intent = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pay"),
    ...coinFields,
    transfers: z.array(z.object({ to: z.string().min(3).max(80), amount: z.number().positive() })).min(1).max(20),
  }),
  z.object({
    kind: z.literal("vault_pay"),
    ...coinFields,
    packageId: z.string().min(3).max(80),
    vaultId: z.string().min(3).max(80),
    capId: z.string().min(3).max(80),
    recipient: z.string().min(3).max(80),
    amount: z.number().positive(),
  }),
  z.object({
    kind: z.literal("swap"),
    ...coinFields,
    packageId: z.string().min(3).max(80),
    poolId: z.string().min(3).max(80),
    fn: z.enum(["swap_sui_to_susd", "swap_susd_to_sui"]),
    amount: z.number().positive(),
  }),
]);
const body = z.object({ sender: z.string().min(3).max(80), intent });

type BalanceChange = { coinType: string; address: string; amount: string };
type SimResult = { Transaction?: { balanceChanges?: BalanceChange[] }; FailedTransaction?: { balanceChanges?: BalanceChange[] } };

/**
 * Build the pay transaction server-side (gRPC resolves the sender's coins), sponsor it with Enoki
 * so the user pays no gas, then simulate the sponsored bytes to return real balance changes.
 * The browser only signs the returned `bytes` — it never touches gRPC.
 */
export async function POST(request: Request) {
  if (!hasEnoki()) return Response.json({ error: "Enoki not configured (ENOKI_PRIVATE_KEY)" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const { sender, intent: it } = parsed.data;
  if (!isValidSuiAddress(sender)) return Response.json({ error: "invalid sender address" }, { status: 400 });
  try {
    const tx = buildIntentTx(sender, it);
    // For vault_pay this dry-run resolves agent_pay; an over-cap/expired/etc. cap violation aborts
    // here with a "MoveAbort … abort code: N" — the client maps that to a BSOD.
    const kindBytes = await tx.build({ client: suiClient(), onlyTransactionKind: true });
    const targets = allowedTargets(it);
    const sponsored = await enokiClient().createSponsoredTransaction({
      network: NETWORK,
      transactionKindBytes: toBase64(kindBytes),
      sender,
      allowedAddresses: allowedFor(sender, it),
      ...(targets ? { allowedMoveCallTargets: targets } : {}),
    });
    // Best-effort: simulate the final sponsored bytes so the Signing dialog can show real deltas.
    let balanceChanges: BalanceChange[] = [];
    try {
      const sim = (await suiClient().simulateTransaction({ transaction: fromBase64(sponsored.bytes), include: { balanceChanges: true } })) as unknown as SimResult;
      balanceChanges = sim.Transaction?.balanceChanges ?? sim.FailedTransaction?.balanceChanges ?? [];
    } catch (e) {
      console.warn("[sui sponsor] simulate failed", (e as Error).message);
    }
    return Response.json({ bytes: sponsored.bytes, digest: sponsored.digest, balanceChanges });
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[sui sponsor]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
