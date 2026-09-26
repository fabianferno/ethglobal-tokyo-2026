import { choice, noul, score } from "@typesafe-ai/sdk";
import type { Candidate } from "./types";

/**
 * The Jev question schema. Every question is answered in parallel against the same text,
 * so we ask everything every time (speculative fan-out) and code decides what matters.
 *
 * Rules: criteria are self-contained and non-overlapping, every question has an escape option,
 * and we never ask Jev to extract values, count, or do math — the parser does that.
 */
export const baseQuestions = {
  shell: choice("Which familiar desktop program does the person want this app to look or behave like", {
    excel: "A spreadsheet like Microsoft Excel: rows, columns, cells, formulas, a table or sheet",
    minesweeper: "The Minesweeper game: a grid of hidden tiles and mines",
    doom: "A first-person shooter game like DOOM, Wolfenstein or Quake: a 3D corridor with monsters, a gun, health and ammo",
    paint: "A drawing program like MS Paint: a canvas, picture, image, meme or artwork",
    weather: "A weather app or forecast: sunny, stormy, temperature, climate",
    notepad: "A plain text editor like Notepad: a diary, journal, notes or log",
    hologram: "A rotating 3D or three-dimensional visualization: a spinning 3-D bar chart, wireframe, hologram, or an old OpenGL/DirectX screensaver look",
    explorer: "A regular app window or dashboard, file browser or control panel",
    unspecified: "No particular program is named or implied",
  }),

  fn: choice("What should the app do with money or crypto", {
    portfolio: "Show the holdings, balances or net worth of a wallet or person",
    perps: "Trade leveraged futures or perpetuals, long or short with leverage",
    dca: "Buy a token repeatedly on a schedule (dollar-cost averaging) or run a grid trading bot",
    lp: "Provide liquidity to a pool and earn trading fees",
    yield: "Earn interest or the best savings rate by lending stablecoins",
    stake: "Stake a token or use liquid staking to earn rewards",
    loan_guard: "Protect a loan or borrow position from liquidation",
    club: "A group of people pooling money to invest together and vote on trades",
    split: "Split bills or shared expenses between friends and settle up",
    pay: "Send, transfer, tip or pay money OUT to a specific person or wallet — money leaving the user to a recipient. NOT requesting, invoicing, or collecting money FROM someone (that flows the wrong way)",
    savings_circle: "A rotating savings circle where members contribute and take turns receiving the pot",
    checkout: "Accept payments as a shop, cafe or merchant, tips or a QR checkout",
    subscription: "Charge people a recurring membership or subscription fee",
    allowance: "Give pocket money or an allowance with spending limits to family members",
    bounty: "Post bounties or tasks and pay the winners",
    escrow: "Hold a payment in escrow until work is delivered",
    rsvp: "Event sign-ups or tickets with a refundable deposit",
    pay_per_call: "Sell data or an API that other agents pay for per request",
    roast: "Make fun of, roast, judge or meme a portfolio or trading history",
    market_mood: "Show how the crypto market feels right now: calm, volatile or crashing",
    journal: "Keep a diary or log of past trades and transactions",
    price_chart: "Show a token's price chart or graph over time: a price line, candles, price history, or how a coin has been doing",
    gas: "Show current network gas fees or gas prices: Ethereum gwei, transaction costs, a gas or gwei tracker",
    compare: "Compare two different wallets or portfolios side by side",
    none: "Nothing to do with money, or too unclear to tell yet",
  }),

  vibe: choice("What tone should the app have", {
    serious: "Professional and factual",
    playful: "Fun, game-like or silly",
    roast: "Mocking or sarcastic",
    hype: "Excited, bullish, to the moon",
    chill: "Calm and relaxed",
  }),

  scene: choice("Which animation best fits the app", {
    coins: "Coins or money flowing, paying, saving",
    ticker: "Stock ticker, prices or trading",
    storm: "Danger, crashes, liquidation or volatility",
    rocket: "Growth, gains, going up",
    sakura: "Friends, community, Japan, gentle",
    pool: "Pools, liquidity, water, yield",
    fire: "Roasting, burning, degen",
    none: "No animation fits",
  }),

  readOnly: noul("The person wants to look at someone else's wallet or data, not act on their own funds"),
  recurring: noul("The app does something repeatedly on a schedule"),
  nonsense: noul("The text asks for something unrelated to apps, money or crypto, or is gibberish"),
  risk: score("How much could this app lose the person's money", [
    "Read-only or no money at risk",
    "Moves money but with predictable outcomes",
    "Leverage, trading or speculation that can lose a lot",
  ]),
};

/** One yes/no per published-app candidate, asked in the same call. */
export function matchQuestions(candidates: Candidate[]) {
  return Object.fromEntries(
    candidates.map((c, i) => [`m${i}`, noul(`An app described as "${c.description}" does what the person is asking for`)]),
  );
}

export const QUESTION_COUNT = Object.keys(baseQuestions).length;
