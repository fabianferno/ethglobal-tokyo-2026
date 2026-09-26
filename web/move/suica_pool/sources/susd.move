/// SUSD — a mock USD coin for Suica OS swaps (testnet demo only). Real DeepBook testnet liquidity is
/// empty, so we deploy our own coin + AMM pool to demo genuine on-chain rebalance/DCA swaps.
module suica_pool::susd;

use sui::coin;

/// One-time witness (named after the module's coin, all-caps).
public struct SUSD has drop {}

#[allow(deprecated_usage)]
fun init(witness: SUSD, ctx: &mut TxContext) {
    let (mut treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"SUSD",
        b"Suica USD",
        b"Mock USD for Suica OS testnet swaps",
        option::none(),
        ctx,
    );
    // Mint 1,000,000 SUSD (6 decimals) to the publisher to seed the pool.
    let minted = coin::mint(&mut treasury, 1_000_000_000_000, ctx);
    transfer::public_transfer(minted, ctx.sender());
    // Keep the TreasuryCap with the publisher so we can top up liquidity later.
    transfer::public_transfer(treasury, ctx.sender());
    transfer::public_freeze_object(metadata);
}
