import { parse } from "@/lib/intent/parse";
import type { Candidate } from "@/lib/intent/types";
import type { AppManifest } from "./compose";

/**
 * Published-app index. Today: a seeded list + the user's own published apps (localStorage).
 * Next: ENSv2 Sepolia subname registrations indexed by MultiBaas.
 */
const seed = (ens: string, owner: string, p: Omit<AppManifest, "id" | "ens" | "params" | "published" | "owner" | "target" | "readOnly"> & { target?: string; readOnly?: boolean }): AppManifest => ({
  id: `pub_${ens}`,
  ens,
  owner,
  target: p.target ?? owner,
  readOnly: p.readOnly ?? false,
  params: parse(p.prompt),
  published: true,
  ...p,
});

export const PUBLISHED: AppManifest[] = [
  seed("grouptab.suica.eth", "kenji", { title: "Group Tab", icon: "people", shell: "explorer", fn: "split", vibe: "chill", scene: "sakura", prompt: "split bills with 4 friends", description: "Shared tab for friends, trips and roommates — settle everything in one gasless tx", users: 214 }),
  seed("izakaya-split.suica.eth", "yui", { title: "Izakaya Split", icon: "people", shell: "explorer", fn: "split", vibe: "playful", scene: "sakura", prompt: "split izakaya bills with 6 friends in yen", description: "Split the izakaya bill in yen, settle in USDC", users: 58 }),
  seed("tanomoshi.suica.eth", "mika", { title: "Tanomoshi", icon: "piggy", shell: "explorer", fn: "savings_circle", vibe: "chill", scene: "sakura", prompt: "savings circle 6 friends 50 usdc monthly", description: "Rotating savings circle — everyone pays in, one person takes the pot each month", users: 41 }),
  seed("sui-usdc-lp.suica.eth", "kenji", { title: "Auto-LP SUI/USDC", icon: "pool", shell: "explorer", fn: "lp", vibe: "serious", scene: "pool", prompt: "auto lp for SUI/USDC", description: "Managed SUI/USDC liquidity on Cetus, auto-rebalanced, 0.5% fee", users: 37 }),
  seed("degen-sweeper.suica.eth", "fabianferno", { title: "Minesweeper · Leverage Futures", icon: "mine", shell: "minesweeper", fn: "perps", vibe: "playful", scene: "storm", prompt: "minesweeper but 20x SUI futures", description: "Minesweeper where every tile is a leveraged SUI perp — mines are liquidations", users: 666 }),
  seed("roast.suica.eth", "fabianferno", { title: "Paint · Portfolio Roast", icon: "paint", shell: "paint", fn: "roast", vibe: "roast", scene: "fire", prompt: "paint app that roasts my portfolio", description: "MS Paint that roasts any ENS name's portfolio", users: 420 }),
  seed("checkout.shibuya-cafe.suica.eth", "shibuya-cafe", { title: "Shibuya Café Checkout", icon: "shop", shell: "explorer", fn: "checkout", vibe: "chill", scene: "coins", prompt: "checkout for my cafe", description: "Pay for coffee with Google login — no wallet, no gas", users: 1290 }),
  seed("yield.suica.eth", "aiko", { title: "Yield Router", icon: "coin", shell: "explorer", fn: "yield", vibe: "serious", scene: "pool", prompt: "keep my USDC at the best lending rate", description: "Keeps USDC at the best Sui lending rate across Suilend, Navi and Scallop", users: 88 }),
  seed("bounties.ethglobal.suica.eth", "ethglobal", { title: "Hackathon Bounty Board", icon: "ticket", shell: "explorer", fn: "bounty", vibe: "hype", scene: "coins", prompt: "bounty board for our hackathon", description: "Post bounties, pay winners in USDC when approved", users: 73 }),
  seed("weather.suica.eth", "sato", { title: "SUI Market Weather", icon: "weather", shell: "weather", fn: "market_mood", vibe: "chill", scene: "storm", prompt: "weather forecast for the SUI market", description: "Weather forecast for the SUI market — sunny to liquidation storm", users: 152 }),
  seed("club.tokyo-hackers.suica.eth", "disha", { title: "Investment Club", icon: "people", shell: "explorer", fn: "club", vibe: "serious", scene: "sakura", prompt: "investment club for my team 5 friends", description: "Group fund, members propose trades, majority vote executes on DeepBook", users: 5 }),
  seed("vitalik-sheet.suica.eth", "ren", { title: "Excel · Portfolio — vitalik.eth", icon: "excel", shell: "excel", fn: "portfolio", vibe: "serious", scene: "ticker", prompt: "excel of vitalik.eth portfolio", description: "Spreadsheet of vitalik.eth's portfolio", target: "vitalik.eth", readOnly: true, users: 301 }),
];

const STOP = new Set(["the", "a", "an", "for", "my", "with", "and", "of", "to", "app", "but", "that", "on", "at", "in", "is", "it", "me", "i"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));

/** Keyword shortlist → Jev asks one yes/no per candidate in the same call. */
export function shortlist(text: string, index: AppManifest[], k = 6): AppManifest[] {
  const q = words(text);
  if (!q.length) return [];
  return index
    .map((m) => {
      const hay = words(`${m.ens} ${m.title} ${m.description} ${m.prompt}`);
      const s = q.reduce((a, w) => a + (hay.some((h) => h.startsWith(w) || (w.length > 3 && h.includes(w))) ? 1 : 0), 0);
      return { m, s: s + Math.log10((m.users ?? 1) + 1) * 0.05 };
    })
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.m);
}

export const toCandidate = (m: AppManifest): Candidate => ({ id: m.id, description: `${m.title}: ${m.description}` });
