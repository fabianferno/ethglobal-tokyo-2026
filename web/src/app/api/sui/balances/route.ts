import { isValidSuiAddress } from "@mysten/sui/utils";
import { fromBaseUnits, SUI_COIN, usdcCoin } from "@/lib/sui/config";
import { hasEnoki, suiClient } from "@/lib/sui/server";

export const runtime = "nodejs";

/** Real Sui balances for the Portfolio app (and vault views). Read-only; needs no wallet, just gRPC. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!isValidSuiAddress(address)) return Response.json({ error: "invalid or missing address" }, { status: 400 });

  // Known coins we can label without a metadata round-trip.
  const known: Record<string, { symbol: string; decimals: number }> = {
    [SUI_COIN.type]: { symbol: SUI_COIN.symbol, decimals: SUI_COIN.decimals },
    [usdcCoin().type]: { symbol: usdcCoin().symbol, decimals: usdcCoin().decimals },
  };

  try {
    const { balances } = await suiClient().listBalances({ owner: address });
    const out = await Promise.all(
      balances.map(async (b) => {
        let meta = known[b.coinType];
        if (!meta) {
          try {
            const m = await suiClient().getCoinMetadata({ coinType: b.coinType });
            meta = { symbol: m.coinMetadata?.symbol || short(b.coinType), decimals: m.coinMetadata?.decimals ?? 0 };
          } catch {
            meta = { symbol: short(b.coinType), decimals: 0 };
          }
        }
        return { coinType: b.coinType, symbol: meta.symbol, decimals: meta.decimals, raw: b.balance, amount: fromBaseUnits(b.balance, meta.decimals) };
      }),
    );
    out.sort((a, z) => (a.symbol === "SUI" ? -1 : z.symbol === "SUI" ? 1 : a.symbol.localeCompare(z.symbol)));
    return Response.json({ address, balances: out });
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[sui balances]", msg);
    // 503 so the client can fall back to mock data (like the ENS index does), rather than error out.
    return Response.json({ error: msg, enoki: hasEnoki() }, { status: 503 });
  }
}

const short = (t: string) => {
  const mod = t.split("::").pop() || t;
  return mod.slice(0, 6).toUpperCase();
};
