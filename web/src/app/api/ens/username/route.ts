import { type Address, isAddress } from "viem";
import { z } from "zod";
import { authSchema, verifyAction } from "@/lib/ens/auth";
import { claimUsername, USERS, usernames } from "@/lib/ens/onchain";
import { etherscanTx, hasServerWallet } from "@/lib/ens/wallet";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Username for a device key: GET ?address=0x… → { ens | null } */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  try {
    return Response.json({ address, ens: (await usernames()).get(address.toLowerCase()) ?? null });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

const body = z.object({ label: z.string().min(1).max(40), auth: authSchema });

/** Claim <label>.users.suica.eth for the signing device key (first come, first served; idempotent per key). */
export async function POST(request: Request) {
  if (!hasServerWallet()) return Response.json({ error: "server wallet not configured" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  let key: Address;
  try {
    key = await verifyAction(parsed.data.auth, { action: "claim", ens: `${parsed.data.label}.${USERS}` });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }
  try {
    const r = await claimUsername(parsed.data.label, key);
    return Response.json({ ens: r.ens, address: key, txs: r.hashes.map((h) => ({ hash: h, url: etherscanTx(h) })) });
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
    console.warn("[ens username]", msg);
    return Response.json({ error: msg }, { status: /invalid label/.test(msg) ? 400 : 500 });
  }
}
