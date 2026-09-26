import { z } from "zod";
import { invalidateIndex, ROOT, setPublished } from "@/lib/ens/onchain";
import { etherscanTx, hasServerWallet } from "@/lib/ens/wallet";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ ens: z.string().max(160).refine((n) => n.endsWith(`.${ROOT}`), "not a Suica OS name"), published: z.boolean() });

/** Publish = flip the `suica.published` text record, so it shows up in everyone's Start search. */
export async function POST(request: Request) {
  if (!hasServerWallet()) return Response.json({ error: "server wallet not configured" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  try {
    const hash = await setPublished(parsed.data.ens, parsed.data.published);
    invalidateIndex();
    return Response.json({ ens: parsed.data.ens, tx: { hash, url: etherscanTx(hash) } });
  } catch (e) {
    return Response.json({ error: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message }, { status: 500 });
  }
}
