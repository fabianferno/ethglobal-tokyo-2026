import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { z } from "zod";
import { NETWORK } from "@/lib/sui/config";
import { enokiClient, hasEnoki } from "@/lib/sui/server";

export const runtime = "nodejs";

const body = z.object({
  jwt: z.string().min(1),
  ephemeralPublicKey: z.string().min(1).max(200),
  randomness: z.string().min(1),
  maxEpoch: z.number().int().nonnegative(),
});

/** Step 2 of zkLogin: exchange the Google id_token for a ZK proof + resolve the user's Sui address. */
export async function POST(request: Request) {
  if (!hasEnoki()) return Response.json({ error: "Enoki not configured (ENOKI_PRIVATE_KEY)" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { jwt, randomness, maxEpoch } = parsed.data;
  try {
    const ephemeralPublicKey = new Ed25519PublicKey(parsed.data.ephemeralPublicKey);
    const zkp = await enokiClient().createZkLoginZkp({ network: NETWORK, jwt, ephemeralPublicKey, randomness, maxEpoch });
    const { address, salt } = await enokiClient().getZkLogin({ jwt });
    // zkp is ZkLoginSignatureInputs (includes addressSeed); the browser assembles the final signature.
    return Response.json({ zkp, address, salt });
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[sui zkp]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
