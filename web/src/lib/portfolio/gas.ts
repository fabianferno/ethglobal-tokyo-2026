import "server-only";
import { priceHistory } from "./prices";

/**
 * Live gas on Ethereum mainnet (public RPC eth_feeHistory) and Sui mainnet (GraphQL reference gas
 * price), priced in USD. Answers "what does a transfer cost right now" — and on Suica OS the answer
 * for the user is $0, because Enoki sponsors the gas.
 */

export type GasReport = {
  eth: { baseGwei: number[]; tipGwei: number; nowGwei: number; transferUsd: number; swapUsd: number; ethUsd: number };
  sui: { referenceMist: number; epoch: number; transferSui: number; transferUsd: number; suiUsd: number };
  fetchedAt: number;
  source: string;
};

const ETH_RPC = process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com";
const SUI_GQL = "https://graphql.mainnet.sui.io/graphql";
/** Typical simple SUI transfer: ~1,000 computation units at the reference price + storage (net of rebate). */
const SUI_TRANSFER_UNITS = 2_000;

let cache: { at: number; p: Promise<GasReport> } | null = null;

async function load(): Promise<GasReport> {
  const [fee, sui, ethP, suiP] = await Promise.all([
    fetch(ETH_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_feeHistory", params: [30, "latest", [50]] }) }).then((r) => r.json()),
    fetch(SUI_GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{ epoch { epochId referenceGasPrice } }" }) }).then((r) => r.json()),
    priceHistory("ETH", 2),
    priceHistory("SUI", 2),
  ]);
  const r = fee.result as { baseFeePerGas: string[]; reward: string[][] };
  if (!r?.baseFeePerGas) throw new Error("eth_feeHistory unavailable");
  const baseGwei = r.baseFeePerGas.map((h) => +(parseInt(h, 16) / 1e9).toFixed(3));
  const tips = r.reward.map((x) => parseInt(x[0], 16) / 1e9).sort((a, b) => a - b);
  const tipGwei = +(tips[Math.floor(tips.length / 2)] ?? 0).toFixed(3);
  const nowGwei = baseGwei[baseGwei.length - 1] + tipGwei;
  const usdFor = (gas: number) => +((gas * nowGwei * 1e-9) * ethP.price).toFixed(4);

  const epoch = sui.data?.epoch as { epochId: number; referenceGasPrice: string } | undefined;
  if (!epoch) throw new Error("Sui reference gas price unavailable");
  const referenceMist = Number(epoch.referenceGasPrice);
  const transferSui = (referenceMist * SUI_TRANSFER_UNITS * 10) / 1e9;

  return {
    eth: { baseGwei, tipGwei, nowGwei: +nowGwei.toFixed(3), transferUsd: usdFor(21_000), swapUsd: usdFor(150_000), ethUsd: ethP.price },
    sui: { referenceMist, epoch: epoch.epochId, transferSui: +transferSui.toFixed(5), transferUsd: +(transferSui * suiP.price).toFixed(5), suiUsd: suiP.price },
    fetchedAt: Date.now(),
    source: "Ethereum publicnode · Sui GraphQL · CoinGecko",
  };
}

/** Gas moves fast, so 30 s is enough cache to absorb a demo's clicking. */
export function gasReport(): Promise<GasReport> {
  if (cache && Date.now() - cache.at < 30_000) return cache.p;
  const p = load();
  cache = { at: Date.now(), p };
  p.catch(() => (cache = null));
  return p;
}
