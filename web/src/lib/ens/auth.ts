import { type Address, type Hex, recoverMessageAddress } from "viem";
import { z } from "zod";
import type { SignedAction } from "./auth-types";

export const authSchema = z.object({ message: z.string().max(400), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

const MAX_AGE_MS = 5 * 60_000;

/** Recover the device key that signed `{action, ens}`. Throws if it's stale or for another request. */
export async function verifyAction(auth: z.infer<typeof authSchema>, expect: { action: SignedAction["action"]; ens: string }): Promise<Address> {
  let msg: SignedAction;
  try {
    msg = JSON.parse(auth.message);
  } catch {
    throw new Error("bad signed message");
  }
  if (msg.app !== "suica-os" || msg.action !== expect.action || msg.ens !== expect.ens) throw new Error("signature is for a different request");
  if (typeof msg.ts !== "number" || Math.abs(Date.now() - msg.ts) > MAX_AGE_MS) throw new Error("signature expired");
  return recoverMessageAddress({ message: auth.message, signature: auth.signature as Hex });
}
