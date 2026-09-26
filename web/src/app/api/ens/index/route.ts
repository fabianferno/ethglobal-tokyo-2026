import { listAll, ROOT } from "@/lib/ens/onchain";

export const runtime = "nodejs";

/** Every app and folder under suica.eth, read from ENSv2 registry events + text records on Sepolia. */
export async function GET() {
  try {
    return Response.json({ root: ROOT, entries: await listAll() });
  } catch (e) {
    return Response.json({ root: ROOT, entries: [], error: (e as Error).message }, { status: 502 });
  }
}
