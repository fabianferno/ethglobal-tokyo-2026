import { publicClient } from "@/lib/ens/wallet";

export const runtime = "nodejs";

/**
 * Resolve a recipient name to a Sui address for the pay/"Send Money" function. Tries the name's own
 * coin-type-784 record, then `<label>.users.suica.eth` (the Suica username scheme). Returns null if
 * the name has no Sui address yet (→ the Send action is disabled with a "ask them to log on" note).
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9.-]{3,120}$/.test(name)) return Response.json({ error: "bad name" }, { status: 400 });

  // Already a raw Sui address → use as-is.
  if (/^0x[0-9a-f]{64}$/.test(name)) return Response.json({ name, via: "literal", address: name });

  // Bare handle "kenji" → kenji.users.suica.eth; "kenji.eth" → also try kenji.users.suica.eth.
  const label = name.replace(/\.eth$/, "").split(".")[0];
  const candidates = name.endsWith(".users.suica.eth") ? [name] : [name, `${label}.users.suica.eth`];

  for (const candidate of candidates) {
    try {
      const addr = await publicClient.getEnsAddress({ name: candidate, coinType: 784n });
      if (addr) return Response.json({ name, via: candidate, address: addr });
    } catch {
      /* not resolvable on this name — try the next candidate */
    }
  }
  return Response.json({ name, address: null });
}
