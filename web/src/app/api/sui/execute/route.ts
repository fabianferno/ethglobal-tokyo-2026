import { z } from "zod";
import { enokiClient, hasEnoki, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const body = z.object({ digest: z.string().min(1), signature: z.string().min(1) });

/** Final step: hand Enoki the user's zkLogin signature; it co-signs (gas) and executes. */
export async function POST(request: Request) {
  if (!hasEnoki()) return Response.json({ error: "Enoki not configured (ENOKI_PRIVATE_KEY)" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const r = await enokiClient().executeSponsoredTransaction({ digest: parsed.data.digest, signature: parsed.data.signature });
    // Best-effort finality so callers can read fresh balances right after.
    try {
      await suiClient().waitForTransaction({ digest: r.digest, timeout: 10_000 });
    } catch {
      /* not fatal — the tx is submitted; the read may just be a beat behind */
    }
    return Response.json({ digest: r.digest });
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[sui execute]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
