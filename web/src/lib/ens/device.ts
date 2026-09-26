"use client";

/**
 * Per-browser EVM "device key": the identity ENSv2 roles are granted to. It never holds funds —
 * the server relays every tx — it only signs requests so the server can check on-chain roles.
 */
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { SignedAction } from "./auth-types";

const KEY = "suicaos:devicekey";

function account() {
  let pk: Hex | null = null;
  try {
    pk = localStorage.getItem(KEY) as Hex | null;
  } catch {
    /* storage blocked: fall through to an ephemeral key */
  }
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey();
    try {
      localStorage.setItem(KEY, pk);
    } catch {
      /* ephemeral for this tab */
    }
  }
  return privateKeyToAccount(pk);
}

let cached: ReturnType<typeof account> | null = null;
const acct = () => (cached ??= account());

export const deviceAddress = (): Address => acct().address;

export async function signAction(action: SignedAction["action"], ens: string): Promise<{ message: string; signature: Hex }> {
  const message = JSON.stringify({ app: "suica-os", action, ens, ts: Date.now() } satisfies SignedAction);
  return { message, signature: await acct().signMessage({ message }) };
}
