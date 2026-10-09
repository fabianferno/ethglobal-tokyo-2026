import "server-only";

/**
 * The app's own spending limit. Every paid call reports what it cost (from the usage the API returns);
 * once today's total (UTC) reaches SPEND_LIMIT_USD_PER_DAY, routes stop calling paid APIs.
 * In-memory: exact on one server, per instance on serverless — keep the provider dashboards' limits as a backstop.
 */

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
};

export const decisionsCost = (inputTokens: number) => (inputTokens * num("DECISIONS_USD_PER_M_INPUT", 0.1)) / 1e6;
export const geminiTextCost = (inputTokens: number, outputTokens: number) =>
  (inputTokens * num("GEMINI_USD_PER_M_INPUT", 0.1) + outputTokens * num("GEMINI_USD_PER_M_OUTPUT", 0.4)) / 1e6;
export const imageCost = () => num("GEMINI_USD_PER_IMAGE", 0.04);

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
let day = "";
let spent = 0;

function roll(now: number) {
  const d = dayOf(now);
  if (d !== day) {
    day = d;
    spent = 0;
  }
}

export function recordSpend(usd: number, now = Date.now()) {
  roll(now);
  spent += Math.max(0, usd);
}
export function spentToday(now = Date.now()) {
  roll(now);
  return spent;
}
export const limitPerDay = () => num("SPEND_LIMIT_USD_PER_DAY", 5);
export const budgetLeft = (now = Date.now()) => Math.max(0, limitPerDay() - spentToday(now));
export const overBudget = (now = Date.now()) => spentToday(now) >= limitPerDay();
/** Tests only. */
export function resetBudget() {
  day = "";
  spent = 0;
}

/** Global (all visitors) hourly caps, on top of the per-visitor limits. */
export const globalPerHour = (name: "COMPOSE" | "CONTENT" | "IMAGE", fallback: number) => num(`GLOBAL_${name}_PER_HOUR`, fallback);
export const BUDGET_MESSAGE = "Jev OS reached today's spending limit. Try again tomorrow.";
export const BUSY_MESSAGE = "Jev OS is very busy right now. Try again in a few minutes.";
