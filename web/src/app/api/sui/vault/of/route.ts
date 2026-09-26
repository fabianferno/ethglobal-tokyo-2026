import { publicClient } from "@/lib/ens/wallet";

export const runtime = "nodejs";

/** Resolve an app's Sui vault from its ENS name (addr at coin type 784) — the ENS × Sui lookup. */
export async function GET(request: Request) {
  const ens = new URL(request.url).searchParams.get("ens")?.trim() ?? "";
  if (!/^[a-z0-9.-]{3,120}$/.test(ens)) return Response.json({ error: "bad ens name" }, { status: 400 });
  try {
    const vault = await publicClient.getEnsAddress({ name: ens, coinType: 784n });
    return Response.json({ ens, vault: vault ?? null, explorer: vault ? `https://suiscan.xyz/testnet/object/${vault}` : null });
  } catch (e) {
    return Response.json({ ens, vault: null, error: (e as Error).message }, { status: 200 });
  }
}
