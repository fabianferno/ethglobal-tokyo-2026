/// AgentVault policy tests: every cap the dashboard shows is enforced by these aborts.
#[test_only]
module suica_vault::vault_tests;

use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};
use suica_vault::vault::{Self, AgentVault, AgentCap};

const OWNER: address = @0xA;
const ALICE: address = @0xB;
const BOB: address = @0xC;
const DAY_MS: u64 = 86_400_000;

/// Owner creates a vault (1% fee, per-tx 100, per-day 150) and funds it with 1_000.
fun setup(allowed: vector<address>, expiry_ms: u64): Scenario {
    let mut s = ts::begin(OWNER);
    vault::create_vault<SUI>(100, 100, 150, allowed, expiry_ms, s.ctx());
    s.next_tx(OWNER);
    {
        let mut v = s.take_shared<AgentVault<SUI>>();
        vault::deposit(&mut v, coin::mint_for_testing<SUI>(1_000, s.ctx()));
        ts::return_shared(v);
    };
    s.next_tx(OWNER);
    s
}

fun pay(s: &mut Scenario, clock: &Clock, to: address, amount: u64) {
    let mut v = s.take_shared<AgentVault<SUI>>();
    let mut cap = s.take_from_sender<AgentCap>();
    vault::agent_pay(&mut v, &mut cap, to, amount, clock, s.ctx());
    s.return_to_sender(cap);
    ts::return_shared(v);
}

#[test]
fun pay_within_cap_splits_fee() {
    let mut s = setup(vector[], 0);
    let clock = clock::create_for_testing(s.ctx());
    pay(&mut s, &clock, ALICE, 100);
    s.next_tx(OWNER);
    {
        let v = s.take_shared<AgentVault<SUI>>();
        assert!(vault::vault_balance(&v) == 900);
        ts::return_shared(v);
        let cap = s.take_from_sender<AgentCap>();
        let (_, _, spent) = vault::cap_limits(&cap);
        assert!(spent == 100);
        s.return_to_sender(cap);
        let fee = s.take_from_sender<Coin<SUI>>();
        assert!(fee.value() == 1); // 1% of 100 to the creator
        s.return_to_sender(fee);
    };
    s.next_tx(ALICE);
    {
        let got = s.take_from_sender<Coin<SUI>>();
        assert!(got.value() == 99);
        s.return_to_sender(got);
    };
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = 2, location = suica_vault::vault)]
fun over_tx_cap_aborts() {
    let mut s = setup(vector[], 0);
    let clock = clock::create_for_testing(s.ctx());
    pay(&mut s, &clock, ALICE, 101);
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = 3, location = suica_vault::vault)]
fun over_day_cap_aborts() {
    let mut s = setup(vector[], 0);
    let clock = clock::create_for_testing(s.ctx());
    pay(&mut s, &clock, ALICE, 100);
    s.next_tx(OWNER);
    pay(&mut s, &clock, ALICE, 51); // 151 > 150
    clock.destroy_for_testing();
    s.end();
}

#[test]
fun day_cap_resets_next_day() {
    let mut s = setup(vector[], 0);
    let mut clock = clock::create_for_testing(s.ctx());
    pay(&mut s, &clock, ALICE, 100);
    s.next_tx(OWNER);
    clock.increment_for_testing(DAY_MS);
    pay(&mut s, &clock, ALICE, 100); // new UTC day → spent_today rolled over
    s.next_tx(OWNER);
    {
        let cap = s.take_from_sender<AgentCap>();
        let (_, _, spent) = vault::cap_limits(&cap);
        assert!(spent == 100);
        s.return_to_sender(cap);
    };
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = 4, location = suica_vault::vault)]
fun recipient_not_on_allowlist_aborts() {
    let mut s = setup(vector[ALICE], 0);
    let clock = clock::create_for_testing(s.ctx());
    pay(&mut s, &clock, BOB, 10);
    clock.destroy_for_testing();
    s.end();
}

#[test]
fun allowlisted_recipient_is_paid() {
    let mut s = setup(vector[ALICE], 0);
    let clock = clock::create_for_testing(s.ctx());
    pay(&mut s, &clock, ALICE, 10);
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = 1, location = suica_vault::vault)]
fun expired_cap_aborts() {
    let mut s = setup(vector[], 1_000);
    let mut clock = clock::create_for_testing(s.ctx());
    clock.set_for_testing(1_001);
    pay(&mut s, &clock, ALICE, 10);
    clock.destroy_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = 0, location = suica_vault::vault)]
fun cap_for_another_vault_aborts() {
    let mut s = setup(vector[], 0);
    let owner_vault_id = ts::most_recent_id_shared<AgentVault<SUI>>().extract();
    // A second vault + cap owned by BOB; BOB's cap must not spend from OWNER's vault.
    s.next_tx(BOB);
    vault::create_vault<SUI>(0, 100, 100, vector[], 0, s.ctx());
    s.next_tx(BOB);
    let clock = clock::create_for_testing(s.ctx());
    let mut bob_cap = s.take_from_sender<AgentCap>();
    let mut owner_vault = s.take_shared_by_id<AgentVault<SUI>>(owner_vault_id);
    vault::agent_pay(&mut owner_vault, &mut bob_cap, ALICE, 10, &clock, s.ctx());
    abort 99 // unreachable
}

#[test, expected_failure(abort_code = 5, location = suica_vault::vault)]
fun non_owner_withdraw_aborts() {
    let mut s = setup(vector[], 0);
    s.next_tx(ALICE);
    let mut v = s.take_shared<AgentVault<SUI>>();
    let c = vault::withdraw(&mut v, 1, s.ctx());
    transfer::public_transfer(c, ALICE);
    ts::return_shared(v);
    s.end();
}

#[test, expected_failure(abort_code = 6, location = suica_vault::vault)]
fun fee_over_100_percent_aborts() {
    let mut s = ts::begin(OWNER);
    vault::create_vault<SUI>(10_001, 1, 1, vector[], 0, s.ctx());
    s.end();
}

#[test]
fun revoke_burns_the_cap() {
    let mut s = setup(vector[], 0);
    let cap = s.take_from_sender<AgentCap>();
    vault::revoke(cap);
    s.next_tx(OWNER);
    assert!(!ts::has_most_recent_for_sender<AgentCap>(&s));
    s.end();
}
