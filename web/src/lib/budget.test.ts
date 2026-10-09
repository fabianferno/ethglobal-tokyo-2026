import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { budgetLeft, decisionsCost, geminiTextCost, imageCost, overBudget, recordSpend, resetBudget, spentToday } from "./budget";

beforeEach(() => resetBudget());
afterEach(() => vi.unstubAllEnvs());

describe("spending limit", () => {
  test("default prices: Decisions $0.10/1M input, Gemini $0.10/$0.40 per 1M, $0.04 per image", () => {
    expect(decisionsCost(1_000_000)).toBeCloseTo(0.1);
    expect(geminiTextCost(1_000_000, 1_000_000)).toBeCloseTo(0.5);
    expect(imageCost()).toBeCloseTo(0.04);
  });

  test("prices and the limit come from env", () => {
    vi.stubEnv("DECISIONS_USD_PER_M_INPUT", "0.2");
    vi.stubEnv("SPEND_LIMIT_USD_PER_DAY", "1");
    expect(decisionsCost(1_000_000)).toBeCloseTo(0.2);
    expect(budgetLeft()).toBeCloseTo(1);
  });

  test("spend adds up and stops paid calls at the daily limit (default $5)", () => {
    recordSpend(4.99);
    expect(overBudget()).toBe(false);
    recordSpend(0.02);
    expect(overBudget()).toBe(true);
    expect(spentToday()).toBeCloseTo(5.01);
  });

  test("the day rolls over at UTC midnight", () => {
    const day1 = Date.UTC(2026, 9, 9, 23, 59);
    recordSpend(6, day1);
    expect(overBudget(day1)).toBe(true);
    expect(overBudget(Date.UTC(2026, 9, 10, 0, 1))).toBe(false);
  });
});
