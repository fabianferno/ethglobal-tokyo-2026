import { z } from "zod";
import { invalidateIndex, mintApp, mintFolder, ROOT } from "@/lib/ens/onchain";
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
  z.object({ kind: z.literal("app"), label: z.string().max(40), parent: z.string().max(120).default(ROOT), manifest, published: z.boolean().default(false) }),
  z.object({ kind: z.literal("folder"), label: z.string().max(40), description: z.string().max(200).optional() }),
]);

/** Mint an app or folder under suica.eth. First come, first served: the response carries the final name. */
export async function POST(request: Request) {
  if (!hasServerWallet()) return Response.json({ error: "server wallet not configured (SEPOLIA_PRIVATE_KEY)" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  // JSON manifest goes on-chain byte for byte; keep it bounded.
  if (parsed.data.kind === "app" && JSON.stringify(parsed.data.manifest).length > 4000) return Response.json({ error: "manifest too large" }, { status: 413 });
  try {
    const r = parsed.data.kind === "app" ? await mintApp(parsed.data) : await mintFolder(parsed.data);
    invalidateIndex();
    return Response.json({ ens: r.ens, txs: r.hashes.map((h) => ({ hash: h, url: etherscanTx(h) })) });
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
    console.warn("[ens mint]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
