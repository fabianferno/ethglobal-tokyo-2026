import { agentWallets } from "@/lib/sui/agents";
import deployment from "@/lib/sui/deployment.json";

export const runtime = "nodejs";

/**
 * Real wallets for the agents on screen (Task Manager / My Computer): each ENS name → its addr(784)
 * AgentVault on Sui → live funds, fee and AgentCap limits. Names with no vault are omitted.
 */
export async function GET(request: Request) {
  const dep = deployment as { packageId?: string | null };
  if (!dep.packageId) return Response.json({ error: "AgentVault not deployed" }, { status: 503 });
  const names = [...new Set((new URL(request.url).searchParams.get("ens") ?? "").split(",").map((s) => s.trim().toLowerCase()))]
    .filter((n) => /^[a-z0-9.-]{3,120}$/.test(n))
    .slice(0, 40);
  try {
    return Response.json({ wallets: names.length ? await agentWallets(names) : [] });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
