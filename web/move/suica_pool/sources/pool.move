/// A tiny constant-price AMM pool (SUI ↔ SUSD) so Suica OS can demo REAL on-chain swaps
/// (rebalance / DCA) without relying on empty public testnet liquidity. Deterministic price,
/// controllable reserves, works with Enoki-sponsored PTBs.
module suica_pool::pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use suica_pool::susd::SUSD;

const EZeroIn: u64 = 0;
const EInsufficientLiquidity: u64 = 1;

const MIST_PER_SUI: u128 = 1_000_000_000;

/// Shared pool. `susd_per_sui_micro` = SUSD (6dp) paid out per 1 SUI (1e9 MIST) in, i.e. the price
/// in SUSD micro-units per whole SUI (e.g. 3_000_000 = 3.00 SUSD / SUI).
public struct Pool has key {
    id: UID,
    sui: Balance<SUI>,
    susd: Balance<SUSD>,
    susd_per_sui_micro: u64,
}

/// Create + share a pool seeded with both sides.
#[allow(lint(share_owned))]
public fun create_pool(sui: Coin<SUI>, susd: Coin<SUSD>, susd_per_sui_micro: u64, ctx: &mut TxContext) {
    let pool = Pool {
        id: object::new(ctx),
        sui: coin::into_balance(sui),
        susd: coin::into_balance(susd),
        susd_per_sui_micro,
    };
    transfer::share_object(pool);
}

/// Top up either side of the pool (liquidity).
public fun add_sui(pool: &mut Pool, sui: Coin<SUI>) { coin::put(&mut pool.sui, sui); }
public fun add_susd(pool: &mut Pool, susd: Coin<SUSD>) { coin::put(&mut pool.susd, susd); }

/// Swap SUI → SUSD at the fixed price. Returns the SUSD out.
public fun swap_sui_to_susd(pool: &mut Pool, sui_in: Coin<SUI>, ctx: &mut TxContext): Coin<SUSD> {
    let amt = coin::value(&sui_in);
    assert!(amt > 0, EZeroIn);
    let out = ((amt as u128) * (pool.susd_per_sui_micro as u128) / MIST_PER_SUI) as u64;
    assert!(balance::value(&pool.susd) >= out, EInsufficientLiquidity);
    balance::join(&mut pool.sui, coin::into_balance(sui_in));
    coin::take(&mut pool.susd, out, ctx)
}

/// Swap SUSD → SUI at the fixed price. Returns the SUI out.
public fun swap_susd_to_sui(pool: &mut Pool, susd_in: Coin<SUSD>, ctx: &mut TxContext): Coin<SUI> {
    let amt = coin::value(&susd_in);
    assert!(amt > 0, EZeroIn);
    let out = ((amt as u128) * MIST_PER_SUI / (pool.susd_per_sui_micro as u128)) as u64;
    assert!(balance::value(&pool.sui) >= out, EInsufficientLiquidity);
    balance::join(&mut pool.susd, coin::into_balance(susd_in));
    coin::take(&mut pool.sui, out, ctx)
}

/* ── Views (dashboard) ── */
public fun reserves(pool: &Pool): (u64, u64) { (balance::value(&pool.sui), balance::value(&pool.susd)) }
public fun price(pool: &Pool): u64 { pool.susd_per_sui_micro }
