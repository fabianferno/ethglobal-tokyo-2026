import { type Address, isAddress } from "viem";
import { normalize } from "viem/ens";
import { z } from "zod";
import { authSchema, verifyAction } from "@/lib/ens/auth";
import { canShare, folderRoles, ROOT, setFolderRole, USERS } from "@/lib/ens/onchain";
import { etherscanTx, hasServerWallet, publicClient, serverWallet } from "@/lib/ens/wallet";

export const runtime = "nodejs";
export const maxDuration = 60;

const folderName = z.string().max(120).regex(/^[a-z0-9-]+\./).refine((n) => n.endsWith(`.${ROOT}`) && n.split(".").length === ROOT.split(".").length + 1, "not a Suica OS folder");

/** Who holds ENSv2 EAC roles on a folder's registry. */
export async function GET(request: Request) {
  const ens = folderName.safeParse(new URL(request.url).searchParams.get("ens") ?? "");
  if (!ens.success) return Response.json({ error: "bad folder name" }, { status: 400 });
  try {
    return Response.json({ ens: ens.data, roles: await folderRoles(ens.data) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

const body = z.object({
  ens: folderName,
  /** 0x address, a username ("alice" → alice.users.suica.eth), or any ENS name (resolved on Sepolia). */
  target: z.string().min(1).max(160),
  role: z.enum(["manager", "member", "none"]),
  auth: authSchema,
});

/** Share / unshare a folder. The signer must be a manager (hold the admin roles) on the folder's registry. */
export async function POST(request: Request) {
  if (!hasServerWallet()) return Response.json({ error: "server wallet not configured" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const { ens, target, role, auth } = parsed.data;

  let signer: Address;
  try {
    signer = await verifyAction(auth, { action: "share", ens });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  let account: Address | null = isAddress(target) ? target : null;
  if (!account) {
    try {
      // A bare username ("alice") means alice.users.suica.eth.
      const name = target.includes(".") ? target : `${target}.${USERS}`;
      account = await publicClient.getEnsAddress({ name: normalize(name) });
    } catch {
      account = null;
    }
  }
  if (!account) return Response.json({ error: `couldn't resolve ${target} on Sepolia` }, { status: 400 });
  if (account.toLowerCase() === serverWallet().account.address.toLowerCase()) return Response.json({ error: `${target} is the Suica OS relayer` }, { status: 400 });

  try {
    if (!(await canShare(ens, signer))) return Response.json({ error: `${signer} is not a manager of ${ens}` }, { status: 403 });
    const hashes = await setFolderRole(ens, account, role === "none" ? null : role);
    return Response.json({ ens, account, role, txs: hashes.map((h) => ({ hash: h, url: etherscanTx(h) })), roles: await folderRoles(ens) });
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
    console.warn("[ens roles]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
