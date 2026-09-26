import "server-only";
/** Turn a serializable SuiIntent into a real Transaction. Server-only (needs coin resolution). */
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";
import type { SuiIntent } from "@/lib/compose/shapes";
import { toBaseUnits } from "./config";

export function buildIntentTx(sender: string, intent: SuiIntent): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);
  if (intent.kind === "pay") {
    const transfers = intent.transfers.filter((t) => t.amount > 0);
    if (!transfers.length) throw new Error("nothing to pay");
    for (const t of transfers) {
      if (!isValidSuiAddress(t.to)) throw new Error(`bad recipient address: ${t.to}`);
      // Pay from the SENDER's own coins, never from tx.gas (that's the sponsor's coin).
      const coin = tx.add(coinWithBalance({ type: intent.coinType, balance: toBaseUnits(t.amount, intent.decimals), useGasCoin: false }));
      tx.transferObjects([coin], t.to);
    }
  } else if (intent.kind === "vault_pay") {
    if (!isValidSuiAddress(intent.recipient)) throw new Error(`bad recipient address: ${intent.recipient}`);
    // Capped spend through the app's AgentVault. Over-cap/expired/etc. aborts on-chain (→ BSOD).
    tx.moveCall({
      target: `${intent.packageId}::vault::agent_pay`,
      typeArguments: [intent.coinType],
      arguments: [tx.object(intent.vaultId), tx.object(intent.capId), tx.pure.address(intent.recipient), tx.pure.u64(toBaseUnits(intent.amount, intent.decimals)), tx.object("0x6")],
    });
  } else if (intent.kind === "swap") {
    if (intent.amount <= 0) throw new Error("nothing to swap");
    // Pay the input from the signer's own coins (SUI never from tx.gas), swap through our AMM pool,
    // and send the output coin back to the signer.
    const inCoin = tx.add(coinWithBalance({ type: intent.coinType, balance: toBaseUnits(intent.amount, intent.decimals), useGasCoin: false }));
    const out = tx.moveCall({ target: `${intent.packageId}::pool::${intent.fn}`, arguments: [tx.object(intent.poolId), inCoin] });
    tx.transferObjects([out], sender);
  }
  return tx;
}

/** Addresses Enoki should allow this sponsored tx to touch (sender for change + all recipients). */
export function allowedFor(sender: string, intent: SuiIntent): string[] {
  const set = new Set<string>([sender]);
  if (intent.kind === "pay") for (const t of intent.transfers) set.add(t.to);
  else if (intent.kind === "vault_pay") set.add(intent.recipient);
  return [...set];
}

/** Move-call targets Enoki should allow for the sponsored tx. */
export function allowedTargets(intent: SuiIntent): string[] | undefined {
  if (intent.kind === "vault_pay") return [`${intent.packageId}::vault::agent_pay`];
  if (intent.kind === "swap") return [`${intent.packageId}::pool::${intent.fn}`];
  return undefined;
}
