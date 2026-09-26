/**
 * Which program did the person name? "tetris but my portfolio" → tetris. Deterministic, runs on every
 * keystroke. A name here that isn't a built-in shell is a candidate for an LLM-generated shell
 * (installed once, then instant for everyone via <label>.shells.suica.eth).
 */

/** Words that already map to a built-in shell (or aren't a program at all). */
const BUILT_IN = new Set([
  "excel", "microsoft excel", "spreadsheet", "sheet", "minesweeper", "mine sweeper", "doom", "paint", "ms paint", "mspaint",
  "weather", "notepad", "explorer", "file explorer", "3d", "3d view", "hologram",
]);

/** Filler that can precede the program name. */
const LEAD = /^(?:(?:please|pls|hey|yo)\s+)?(?:(?:make|build|create|give|show|open|play|launch|start|run)\s+(?:me\s+)?)?(?:(?:a|an|the|some)\s+)?/;

/** Programs people will plausibly ask for. A hit here doesn't need the "X but …" pattern to count. */
const KNOWN = [
  "tetris", "snake", "pong", "pac-man", "pacman", "space invaders", "galaga", "breakout", "arkanoid", "flappy bird", "tamagotchi",
  "solitaire", "freecell", "hearts", "pinball", "3d pinball", "frogger", "asteroids", "2048", "sim city", "simcity", "pokemon",
  "mario", "super mario", "zelda", "street fighter", "duck hunt", "winamp", "calculator", "outlook", "msn", "msn messenger",
  "calendar", "clock", "chess", "checkers", "sudoku", "wordle", "crossword", "slot machine", "pachinko", "roulette", "blackjack",
  "poker", "bingo", "guitar hero", "dance dance revolution", "ddr", "tony hawk", "rollercoaster tycoon", "the sims", "age of empires",
  "doom 2", "quake", "wolfenstein", "lemmings", "worms", "tamagochi", "neopets", "habbo", "runescape", "minecraft", "angry birds",
  "fruit ninja", "candy crush", "temple run", "subway surfers", "geometry dash", "among us", "stardew valley", "animal crossing",
  "powerpoint", "word", "clippy", "defrag", "screensaver", "flying toasters", "pipes", "maze", "skifree", "jezzball", "chip's challenge",
];

/** Words that are a function/target, not a program ("split bills but in yen"). */
const NOT_PROGRAM = new Set([
  "split", "split bills", "portfolio", "my portfolio", "savings circle", "dca", "yield", "lp", "bounty", "checkout", "subscription",
  "allowance", "escrow", "rsvp", "loan", "stake", "club", "roast", "alerts", "journal", "app", "an app", "something", "anything", "it", "this",
  "leverage", "futures", "perps", "a", "me",
]);

export type GameHit = { name: string; label: string };

export const shellLabel = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "program";

/** Known program names that are also everyday words. */
const AMBIGUOUS = new Set(["word", "clock", "hearts", "maze", "pipes", "calendar", "outlook", "bingo", "poker", "roulette", "crossword", "defrag", "screensaver", "worms", "chess", "checkers", "pong", "snake"]);
/** Words that describe an app rather than name a program. */
const DESCRIPTIVE = new Set([
  "my", "me", "mine", "our", "your", "i", "something", "anything", "everything", "fun", "cute", "safe", "safer", "slower", "faster", "simple", "pink", "dark",
  "roast", "wallet", "portfolio", "bags", "bag", "holdings", "dashboard", "tracker", "bot", "router", "split", "dca", "yield", "lp", "stake", "staking", "savings",
  "circle", "tab", "checkout", "subscription", "allowance", "bounty", "escrow", "rsvp", "journal", "diary", "chart", "graph", "price", "prices", "weather", "sheet",
  "leverage", "perps", "futures", "loan", "vault", "agent", "app", "apps", "tool", "page", "site", "website", "list", "todo", "notes",
]);

/** First words that are a built-in shell ("weather in tokyo but …" is Weather, not a new program). */
const BUILT_IN_HEADS = new Set(["excel", "spreadsheet", "sheet", "minesweeper", "doom", "paint", "weather", "notepad", "explorer", "3d", "hologram", "microsoft", "ms"]);

export function detectProgram(prompt: string): GameHit | null {
  const raw = prompt.toLowerCase().trim().replace(/\s+/g, " ");
  const t = raw.replace(LEAD, "");
  if (!t) return null;

  // Longest known name at the start wins ("space invaders but …", "3d pinball of …").
  const known = KNOWN.filter((k) => t === k || t.startsWith(`${k} `) || t.startsWith(`${k},`) || t.startsWith(`${k}-style`) || t.startsWith(`${k}.exe`)).sort((a, b) => b.length - a.length)[0];
  // Program names that are also everyday words ("word of the day", "hearts for my friends") only
  // count when clearly used as a program: alone, or followed by but / game / clone / -style.
  if (known && (!AMBIGUOUS.has(known) || new RegExp(`^${known}(?:$|\\s+(?:but|game|clone|app)\\b|-style|\\.exe)`).test(t))) return { name: known, label: shellLabel(known) };
  if (known) return null;

  // Unknown names cost a paid generation, so be strict: the prompt must START with the program
  // ("zelda but …", not "make me a sandwich but …"), it must be 1–2 words, and it must be marked as a
  // program ("X but …" / "X game" / "X clone").
  if (t !== raw) return null;
  // (No ".exe" here: "fridge.exe" is the OS's own not-found joke, not a request for a program.)
  const m = t.match(/^([a-z0-9][a-z0-9'-]*(?: [a-z0-9'-]+)?)(?:\s*-?\s*(?:style|clone|game))?\s+(?:but|where|except)\b/) ?? t.match(/^([a-z0-9][a-z0-9'-]*(?: [a-z0-9'-]+)?)\s+(?:game|clone)\b/);
  const name = m?.[1]?.trim();
  if (!name || BUILT_IN.has(name) || NOT_PROGRAM.has(name) || BUILT_IN_HEADS.has(name.split(" ")[0])) return null;
  // A lone common word before "but" is usually a request, not a program ("coffee but on chain"),
  // and any function/possessive word means it's describing an app ("roast me but gently", "my wallet but in yen").
  if (/^(coffee|tea|sandwich|pizza|food|lunch|dinner|money|crypto|wallet|bills?|rent|payment|payments|salary|savings|trip|party|gift|tip|tips)$/.test(name)) return null;
  if (name.split(" ").some((w) => DESCRIPTIVE.has(w))) return null;
  return { name, label: shellLabel(name) };
}

/** "tetris" → "TETRIS.EXE", the way Setup would show it. */
export const exeName = (name: string) => `${shellLabel(name).replace(/-/g, "").toUpperCase().slice(0, 8)}.EXE`;
