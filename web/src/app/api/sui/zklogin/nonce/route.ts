import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { z } from "zod";
import { NETWORK } from "@/lib/sui/config";
import { enokiClient, hasEnoki } from "@/lib/sui/server";

export const runtime = "nodejs";

const body = z.object({ ephemeralPublicKey: z.string().min(1).max(200) });

/** Step 1 of zkLogin: mint a nonce bound to the browser's ephemeral key, to put in the Google request. */
export async function POST(request: Request) {
  if (!hasEnoki()) return Response.json({ error: "Enoki not configured (ENOKI_PRIVATE_KEY)" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const ephemeralPublicKey = new Ed25519PublicKey(parsed.data.ephemeralPublicKey);
    const r = await enokiClient().createZkLoginNonce({ network: NETWORK, ephemeralPublicKey });
    return Response.json(r); // { nonce, randomness, epoch, maxEpoch, estimatedExpiration }
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[sui nonce]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
