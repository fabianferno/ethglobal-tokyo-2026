import type { Address } from "viem";
import { z } from "zod";
import { authSchema, verifyAction } from "@/lib/ens/auth";
import { canMintInto, invalidateIndex, mintApp, mintFolder, ROOT } from "@/lib/ens/onchain";
import { etherscanTx, hasServerWallet } from "@/lib/ens/wallet";

export const runtime = "nodejs";
export const maxDuration = 60;

const manifest = z.object({
  v: z.literal(1),
  title: z.string().max(120),
  icon: z.string().max(32),
  shell: z.string().max(32),
  fn: z.string().max(32),
  vibe: z.string().max(32),
  scene: z.string().max(32),
  prompt: z.string().max(400),
  params: z.unknown(),
  readOnly: z.boolean(),
  target: z.string().max(120),
  owner: z.string().max(64),
  description: z.string().max(300),
});

const body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("app"),
    label: z.string().max(40),
    parent: z.string().max(120).default(ROOT),
    manifest,
    published: z.boolean().default(false),
    aliasFrom: z.string().max(160).optional(),
    auth: authSchema.optional(),
  }),
  z.object({ kind: z.literal("folder"), label: z.string().max(40), description: z.string().max(200).optional(), auth: authSchema.optional() }),
]);

/**
 * Mint an app or folder under suica.eth. First come, first served: the response carries the final name.
 * `auth` is the caller's device-key signature: it becomes the name's resolver admin (and a folder's manager),
 * and minting into a folder requires that key to hold ROLE_REGISTRAR on the folder's registry.
 */
export async function POST(request: Request) {
  if (!hasServerWallet()) return Response.json({ error: "server wallet not configured (SEPOLIA_PRIVATE_KEY)" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const d = parsed.data;
  // JSON manifest goes on-chain byte for byte; keep it bounded.
  if (d.kind === "app" && JSON.stringify(d.manifest).length > 4000) return Response.json({ error: "manifest too large" }, { status: 413 });
  const target = d.kind === "app" ? `${d.label}.${d.parent}` : `${d.label}.${ROOT}`;

  let signer: Address | undefined;
  if (d.auth) {
    try {
      signer = await verifyAction(d.auth, { action: "mint", ens: target });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 401 });
    }
  }
  try {
    if (d.kind === "app" && d.parent !== ROOT) {
      if (!signer) return Response.json({ error: `sign in to mint into ${d.parent}` }, { status: 401 });
      if (!(await canMintInto(d.parent, signer))) return Response.json({ error: `${signer} has no ROLE_REGISTRAR on ${d.parent}` }, { status: 403 });
    }
    const r = d.kind === "app" ? await mintApp({ ...d, creator: signer }) : await mintFolder({ ...d, owner: signer });
    invalidateIndex();
    return Response.json({ ens: r.ens, resolver: r.resolver, aliased: "aliased" in r ? r.aliased : undefined, txs: r.hashes.map((h) => ({ hash: h, url: etherscanTx(h) })) });
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
    console.warn("[ens mint]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
