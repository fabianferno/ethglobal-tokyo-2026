import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";
import { toBaseUnits, usdcCoin } from "@/lib/sui/config";
import { hasServerKeypair, serverAddress, serverKeypair, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** "Charge your Suica": the server tops a new user up so they can transact. Prefers USDC (the demo
 * currency); falls back to a little SUI when the server holds no USDC yet, so the flow works either way. */
const TOP_UP_USDC = 5;
const TOP_UP_SUI = 0.05;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** In-memory rate limit. Good enough for the hackathon demo; not durable across restarts/instances. */
const lastCharge = new Map<string, number>();

const body = z.object({ address: z.string().min(3).max(80) });

export async function POST(request: Request) {
  if (!hasServerKeypair()) return Response.json({ error: "Sui server wallet not configured (SUI_PRIVATE_KEY)" }, { status: 503 });
  // Per-IP cap on top of the per-address cooldown, so one client can't drain the wallet across addresses.
  const rl = rateLimit(`charge:${clientKey(request)}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const address = parsed.data.address;
  if (!isValidSuiAddress(address)) return Response.json({ error: "invalid address" }, { status: 400 });

  const prev = lastCharge.get(address);
  if (prev && Date.now() - prev < COOLDOWN_MS) return Response.json({ error: "already charged recently" }, { status: 429 });
  lastCharge.set(address, Date.now());

  try {
    const usdc = usdcCoin();
    // Prefer USDC; fall back to SUI if the server has no USDC balance yet.
    const { balances } = await suiClient().listBalances({ owner: serverAddress() });
    const usdcBal = BigInt(balances.find((b) => b.coinType === usdc.type)?.balance ?? "0");
    const useUsdc = usdcBal >= toBaseUnits(TOP_UP_USDC, usdc.decimals);
    const token = useUsdc ? "USDC" : "SUI";
    const amount = useUsdc ? TOP_UP_USDC : TOP_UP_SUI;

    const tx = new Transaction();
    tx.setSender(serverAddress());
    const coin = useUsdc
      ? tx.add(coinWithBalance({ type: usdc.type, balance: toBaseUnits(TOP_UP_USDC, usdc.decimals) }))
      : tx.splitCoins(tx.gas, [tx.pure.u64(toBaseUnits(TOP_UP_SUI, 9))])[0]; // SUI from the server's gas coin
    tx.transferObjects([coin], address);
    const bytes = await tx.build({ client: suiClient() });
    const { signature } = await serverKeypair().signTransaction(bytes);
    const res = (await suiClient().executeTransaction({ transaction: bytes, signatures: [signature] })) as unknown as { digest?: string; transaction?: { digest?: string } };
    const digest = res.digest ?? res.transaction?.digest ?? null;
    return Response.json({ digest, amount, token });
  } catch (e) {
    lastCharge.delete(address); // let them retry if the send itself failed
    const msg = (e as Error).message;
    console.warn("[sui charge]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
