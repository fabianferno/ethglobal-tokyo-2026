/// Suica OS — AgentVault: the one generic contract behind every money app.
///
/// An `AgentVault<T>` is a per-app treasury (shared object) holding one coin type. The creator
/// gets an `AgentCap` — the agent's permission slip with per-tx / per-day caps, an optional
/// recipient allowlist, and an expiry. `agent_pay` enforces those limits on-chain; any violation
/// `abort`s, and Suica OS surfaces that abort as a BSOD. `fee_bps` routes a fee to the creator.
module suica_vault::vault;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};

/// Abort codes — surfaced as the OS BSOD when an agent breaks policy.
const ENotAuthorized: u64 = 0;
const EExpired: u64 = 1;
const EOverTxCap: u64 = 2;
const EOverDayCap: u64 = 3;
const ERecipientNotAllowed: u64 = 4;
const ENotOwner: u64 = 5;
const EBadFee: u64 = 6;

const MS_PER_DAY: u64 = 86_400_000;
const BPS_DENOM: u64 = 10_000;

/// Per-app treasury. Shared object; anyone can `deposit`, only the creator can `withdraw`,
/// and only an `AgentCap` holder can `agent_pay` within the cap's limits.
public struct AgentVault<phantom T> has key {
    id: UID,
    funds: Balance<T>,
    creator: address,
    fee_bps: u16,
}

/// The agent's permission slip (owned). Whoever holds it can spend from the vault within limits.
public struct AgentCap has key, store {
    id: UID,
    vault_id: ID,
    per_tx_cap: u64,
    per_day_cap: u64,
    spent_today: u64,
    day: u64,
    /// Empty = any recipient allowed.
    allowed_recipients: vector<address>,
    /// 0 = never expires; else a unix ms deadline compared against the Clock.
    expiry_ms: u64,
}

/// Create a vault for coin type `T` and hand the caller its `AgentCap`.
/// (self_transfer lint allowed: handing the creator their own cap is intended, not composable output.)
#[allow(lint(self_transfer))]
public fun create_vault<T>(
    fee_bps: u16,
    per_tx_cap: u64,
    per_day_cap: u64,
    allowed_recipients: vector<address>,
    expiry_ms: u64,
    ctx: &mut TxContext,
) {
    assert!((fee_bps as u64) <= BPS_DENOM, EBadFee);
    let vault = AgentVault<T> {
        id: object::new(ctx),
        funds: balance::zero<T>(),
        creator: ctx.sender(),
        fee_bps,
    };
    let cap = AgentCap {
        id: object::new(ctx),
        vault_id: object::id(&vault),
        per_tx_cap,
        per_day_cap,
        spent_today: 0,
        day: 0,
        allowed_recipients,
        expiry_ms,
    };
    transfer::share_object(vault);
    transfer::public_transfer(cap, ctx.sender());
}

/// Anyone can top up a vault.
public fun deposit<T>(vault: &mut AgentVault<T>, coin: Coin<T>) {
    coin::put(&mut vault.funds, coin);
}

/// Only the creator can withdraw directly (bypasses caps — it's their own money).
public fun withdraw<T>(vault: &mut AgentVault<T>, amount: u64, ctx: &mut TxContext): Coin<T> {
    assert!(ctx.sender() == vault.creator, ENotOwner);
    coin::take(&mut vault.funds, amount, ctx)
}

/// The capped agent spend. Enforces cap↔vault match, expiry, per-tx and rolling per-day limits,
/// and the recipient allowlist; then pays the fee to the creator and the remainder to `recipient`.
/// Any failed assertion aborts the transaction (→ Suica OS BSOD), and no funds move.
public fun agent_pay<T>(
    vault: &mut AgentVault<T>,
    cap: &mut AgentCap,
    recipient: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(cap.vault_id == object::id(vault), ENotAuthorized);

    let now = clock.timestamp_ms();
    assert!(cap.expiry_ms == 0 || now <= cap.expiry_ms, EExpired);

    assert!(amount <= cap.per_tx_cap, EOverTxCap);

    // Roll the daily window over at UTC-day boundaries.
    let today = now / MS_PER_DAY;
    if (today != cap.day) {
        cap.day = today;
        cap.spent_today = 0;
    };
    assert!(cap.spent_today + amount <= cap.per_day_cap, EOverDayCap);
    cap.spent_today = cap.spent_today + amount;

    assert!(
        cap.allowed_recipients.is_empty() || cap.allowed_recipients.contains(&recipient),
        ERecipientNotAllowed,
    );

    let mut paid = coin::take(&mut vault.funds, amount, ctx);
    let fee = amount * (vault.fee_bps as u64) / BPS_DENOM;
    if (fee > 0) {
        let fee_coin = coin::split(&mut paid, fee, ctx);
        transfer::public_transfer(fee_coin, vault.creator);
    };
    transfer::public_transfer(paid, recipient);
}

/// End Process: the owner burns an AgentCap, permanently revoking the agent's ability to spend.
public fun revoke(cap: AgentCap) {
    let AgentCap { id, .. } = cap;
    object::delete(id);
}

/* ── Views (for the dashboard: My Computer drives, Task Manager) ── */
public fun vault_balance<T>(vault: &AgentVault<T>): u64 { vault.funds.value() }
public fun creator<T>(vault: &AgentVault<T>): address { vault.creator }
public fun fee_bps<T>(vault: &AgentVault<T>): u16 { vault.fee_bps }
public fun cap_limits(cap: &AgentCap): (u64, u64, u64) { (cap.per_tx_cap, cap.per_day_cap, cap.spent_today) }
