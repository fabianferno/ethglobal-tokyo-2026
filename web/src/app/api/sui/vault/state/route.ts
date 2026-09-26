import deployment from "@/lib/sui/deployment.json";
import { suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";

/**
 * Real on-chain state of the deployed AgentVault + its AgentCap — powers the Curvegrid dashboard
 * (My Computer "drive", Task Manager caps). Read-only; no wallet needed.
 */
export async function GET() {
  const dep = deployment as { packageId?: string | null; demoVault?: string; demoCap?: string };
  if (!dep.packageId || !dep.demoVault || !dep.demoCap) return Response.json({ error: "AgentVault not deployed" }, { status: 503 });
  try {
    const [v, c] = await Promise.all([
      suiClient().getObject({ objectId: dep.demoVault, include: { json: true } as never }),
      suiClient().getObject({ objectId: dep.demoCap, include: { json: true } as never }),
    ]);
    const vj = ((v as unknown as { object?: { json?: Record<string, unknown> } }).object?.json ?? {}) as { funds?: string; creator?: string; fee_bps?: number };
    const cj = ((c as unknown as { object?: { json?: Record<string, unknown> } }).object?.json ?? {}) as { per_tx_cap?: string; per_day_cap?: string; spent_today?: string };
    return Response.json({
      vault: dep.demoVault,
      cap: dep.demoCap,
      packageId: dep.packageId,
      symbol: "SUI",
      decimals: 9,
      funds: vj.funds ?? "0",
      creator: vj.creator ?? null,
      feeBps: vj.fee_bps ?? 0,
      perTxCap: cj.per_tx_cap ?? "0",
      perDayCap: cj.per_day_cap ?? "0",
      spentToday: cj.spent_today ?? "0",
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
