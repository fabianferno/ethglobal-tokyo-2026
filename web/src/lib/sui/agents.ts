import "server-only";
import { publicClient } from "@/lib/ens/wallet";
import deployment from "./deployment.json";
import { serverAddress, suiClient } from "./server";

/** One agent's real wallet: the AgentVault its ENS name points at (addr 784) + the AgentCap bounding it. */
export type AgentWallet = {
  ens: string;
  vault: string;
  cap: string | null;
  funds: string;
  feeBps: number;
  perTxCap: string;
  perDayCap: string;
  spentToday: string;
};

type Obj = { objectId: string; type?: string; json?: Record<string, unknown> };
const dep = deployment as { packageId?: string | null; demoVault?: string; demoCap?: string };

/** Every AgentCap the agent runtime (server) holds, keyed by the vault it bounds. */
async function serverCaps(): Promise<Map<string, Obj>> {
  const out = new Map<string, Obj>();
  if (!dep.packageId) return out;
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const res = (await suiClient().listOwnedObjects({ owner: serverAddress(), type: `${dep.packageId}::vault::AgentCap`, include: { json: true }, cursor } as never)) as unknown as {
      objects: Obj[];
      hasNextPage?: boolean;
      cursor?: string | null;
    };
    for (const o of res.objects) {
      const v = o.json?.vault_id;
      if (typeof v === "string") out.set(v, o);
    }
    if (!res.hasNextPage || !res.cursor) break;
    cursor = res.cursor;
  }
  return out;
}

const vaultCache = new Map<string, { at: number; vault: string | null }>();

/** ENS → Sui vault via the app's addr(784) record; cached 60s (Sepolia reads are slow). */
export async function vaultOf(ens: string): Promise<string | null> {
  const hit = vaultCache.get(ens);
  if (hit && Date.now() - hit.at < 60_000) return hit.vault;
  let vault: string | null = null;
  try {
    const a = await publicClient.getEnsAddress({ name: ens, coinType: 784n });
    vault = a && /^0x[0-9a-fA-F]{64}$/.test(a) ? a.toLowerCase() : null;
  } catch {
    vault = null;
  }
  vaultCache.set(ens, { at: Date.now(), vault });
  return vault;
}

export function forgetVault(ens: string) {
  vaultCache.delete(ens);
}

async function readVault(vault: string, cap: Obj | undefined, ens: string): Promise<AgentWallet | null> {
  try {
    const v = (await suiClient().getObject({ objectId: vault, include: { json: true } } as never)) as unknown as { object?: { json?: Record<string, unknown> } };
    const vj = (v.object?.json ?? {}) as { funds?: string; fee_bps?: number };
    const cj = (cap?.json ?? {}) as { per_tx_cap?: string; per_day_cap?: string; spent_today?: string };
    return {
      ens,
      vault,
      cap: cap?.objectId ?? null,
      funds: vj.funds ?? "0",
      feeBps: vj.fee_bps ?? 0,
      perTxCap: cj.per_tx_cap ?? "0",
      perDayCap: cj.per_day_cap ?? "0",
      spentToday: cj.spent_today ?? "0",
    };
  } catch {
    return null;
  }
}

/** Real on-chain wallets for a set of agent ENS names. Names without a vault are simply absent. */
export async function agentWallets(names: string[]): Promise<AgentWallet[]> {
  const [caps, vaults] = await Promise.all([serverCaps(), Promise.all(names.map(async (ens) => [ens, await vaultOf(ens)] as const))]);
  const rows = await Promise.all(vaults.filter(([, v]) => v).map(([ens, v]) => readVault(v!, caps.get(v!), ens)));
  return rows.filter((r): r is AgentWallet => !!r);
}

/** The server-held AgentCap for a vault, if any (null once revoked). */
export async function capFor(vault: string): Promise<string | null> {
  return (await serverCaps()).get(vault.toLowerCase())?.objectId ?? null;
}

export const DEMO_VAULT = dep.demoVault?.toLowerCase() ?? null;
