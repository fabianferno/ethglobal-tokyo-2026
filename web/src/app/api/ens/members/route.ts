import { isValidSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";
import { addMember, getMembers } from "@/lib/ens/onchain";
import { etherscanTx, hasServerWallet } from "@/lib/ens/wallet";

export const runtime = "nodejs";
export const maxDuration = 60;

const ensName = z.string().min(3).max(120).regex(/^[a-z0-9.-]+$/);

/** Read the Sui addresses that have joined this app (Group Tab members). */
export async function GET(request: Request) {
  const ens = new URL(request.url).searchParams.get("ens")?.trim() ?? "";
  if (!ensName.safeParse(ens).success) return Response.json({ error: "bad ens name" }, { status: 400 });
  try {
    return Response.json({ ens, members: await getMembers(ens) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

const body = z.object({ ens: ensName, address: z.string().min(3).max(80) });

/** Join: append the caller's Sui address to the app's `suica.members` record. */
export async function POST(request: Request) {
  if (!hasServerWallet()) return Response.json({ error: "server wallet not configured (SEPOLIA_PRIVATE_KEY)" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  if (!isValidSuiAddress(parsed.data.address)) return Response.json({ error: "invalid Sui address" }, { status: 400 });
  try {
    const { members, hash } = await addMember(parsed.data.ens, parsed.data.address);
    return Response.json({ members, tx: hash ? { hash, url: etherscanTx(hash) } : null });
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
    console.warn("[ens members]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
