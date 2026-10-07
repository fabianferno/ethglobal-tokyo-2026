import {
  type Answer,
  type IntentResult,
  noneResult,
  SCENES,
  type SceneKey,
  SHAPE_KEYS,
  type ShapeKey,
  SHELL_KEYS,
  type ShellKey,
  VIBES,
  type Vibe,
} from "./types";
import { detectProgram } from "@/lib/genshell/detect";

/**
 * Offline keyword classifier with the exact output shape of Jev.
 * Keeps the OS alive with no API key, on flaky venue wifi, and in tests.
 */
export const MOCK_MODEL = "jev-offline";

type Rules<K extends string> = [RegExp, K, number][];

const SHELL_RULES: Rules<ShellKey> = [
  [/\b(excel|spreadsheet|sheet|table|cells?|formula|csv|lotus)\b/, "excel", 6],
  [/\b(mine ?sweeper|mines?|minefield)\b/, "minesweeper", 7],
  [/\b(doom|wolfenstein|quake|fps|first.?person shooter|shooter|raycaster)\b/, "doom", 6.5],
  [/\b(paint|ms ?paint|draw|drawing|canvas|picture|image|meme|art|artwork|pfp|avatar)\b/, "paint", 6],
  [/\b(weather|forecast|climate|sunny|storm|temperature|rain)\b/, "weather", 6],
  [/\b(notepad|diary|journal|notes?|text ?file|log)\b/, "notepad", 5],
  [/\b(3d|3-d|three.?d|hologram|holographic|wireframe|opengl|directx|isometric)\b/, "hologram", 6.5],
  // The app named first wins: "weather app with an image of …" is Weather, not Paint (a picture is content, not the shell).
  [/^\s*(?:an?\s+|open\s+)?(excel|spreadsheet)\b/, "excel", 9],
  [/^\s*(?:an?\s+|open\s+)?(weather)\b/, "weather", 9],
  [/^\s*(?:an?\s+|open\s+)?(notepad)\b/, "notepad", 9],
  [/^\s*(?:an?\s+|open\s+)?(mine ?sweeper)\b/, "minesweeper", 9],
  [/^\s*(?:an?\s+|open\s+)?(doom)\b/, "doom", 9],
  [/^\s*(?:an?\s+|open\s+)?(hologram|3d)\b/, "hologram", 9],
  // NB: "app"/"window" removed — too generic, they used to mask gibberish as a "known" shell.
  [/\b(explorer|dashboard|control panel|file browser|my computer)\b/, "explorer", 1.5],
];

const SHAPE_RULES: Rules<ShapeKey> = [
  [/\b(table|sheet|spreadsheet|ranking|rank|compare|comparison|comparing|schedule|timetable|best)\b/, "table", 5],
  [/\b(list|top \d+|picks|tips|ideas|steps|todo|to-?do|checklist|recommend\w*)\b/, "list", 4.5],
  [/\b(chart|graph|trend|over time|history|timeline|population|growth|per (year|month|day))\b/, "series", 5],
  [/\b(mood|level|meter|gauge|rating|score|forecast|how (am|is|are))\b/, "gauge", 4.5],
  [/\b(roast|pep talk|fortune|verdict|horoscope|hype me|motivat\w*|poster)\b/, "scene", 6],
  [/\b(game|board|mines?|minesweeper|doom|dungeon|enemies)\b/, "grid", 5],
  [/\b(story|letter|poem|diary|journal|essay|notes?|notepad|write|haiku|lyrics|recipe)\b/, "doc", 5.5],
  [/\b(picture|image|photo|drawing|draw|illustration|painting|portrait|wallpaper|sketch|artwork)\b/, "picture", 6.5],
];

/** A shell with no stated content implies one. */
const SHELL_DEFAULT_SHAPE: Partial<Record<ShellKey, ShapeKey>> = {
  excel: "table",
  minesweeper: "grid",
  doom: "grid",
  paint: "scene",
  weather: "gauge",
  notepad: "doc",
  hologram: "series",
};

const VIBE_RULES: Rules<Vibe> = [
  [/\b(roast|make fun|clown|judge|mock)\b/, "roast", 6],
  [/\b(game|minesweeper|fun|silly|pinball|solitaire|meme|cats?|pirate)\b/, "playful", 3],
  [/\b(hype|lfg|epic|insane|amazing|pep talk)\b/, "hype", 4],
  [/\b(chill|calm|relax|cozy|zen)\b/, "chill", 4],
];

const SCENE_RULES: Rules<SceneKey> = [
  [/\b(roast|burn|fire|hot|spicy)\b/, "fire", 5],
  [/\b(crash|storm|chaos|disaster|haunted|danger|doom|enemies)\b/, "storm", 4],
  [/\b(rocket|launch|growth|fast|space|tallest)\b/, "rocket", 4],
  [/\b(friends?|team|tokyo|japan|family|kids?|ramen|sushi|onigiri|anime)\b/, "sakura", 3.5],
  [/\b(pool|beach|summer|travel|hikes?|rain|ocean|water)\b/, "pool", 3.5],
  [/\b(excel|stocks?|ticker|scores?|news|data|population|chart)\b/, "ticker", 3],
  [/\b(magic|stars?|party|birthday|fortune|celebrat\w*|cats?|cute)\b/, "sparkle", 3],
];

function classify<K extends string>(keys: readonly K[], rules: Rules<K>, t: string, fallback: K, temp = 0.9): Answer<K> {
  const s: Partial<Record<K, number>> = {};
  for (const [re, k, w] of rules) if (re.test(t)) s[k] = (s[k] ?? 0) + w;
  s[fallback] = (s[fallback] ?? 0) + 1.2;
  const exps = keys.map((k) => Math.exp((s[k] ?? 0) / temp));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(keys.map((k, i) => [k, exps[i] / sum])) as Record<K, number>;
  const value = keys.reduce((a, b) => (probabilities[b] > probabilities[a] ? b : a));
  return { value, confidence: probabilities[value], probabilities };
}

const vowelWords = (t: string) => (t.match(/[a-z]{3,}/g) ?? []).filter((w) => /[aeiou]/.test(w) && !/(.)\1\1/.test(w) && !/[^aeiou]{5}/.test(w));

export function mockClassify(text: string): IntentResult {
  const t = text.toLowerCase().trim();
  if (t.length < 2) return noneResult({ model: MOCK_MODEL, source: "mock" });

  const shell = classify(SHELL_KEYS, SHELL_RULES, t, "unspecified");
  const shapeFired = SHAPE_RULES.some(([re]) => re.test(t));
  const fallbackShape = SHELL_DEFAULT_SHAPE[shell.value] ?? "list";
  const shape: Answer<ShapeKey> = shapeFired
    ? classify(SHAPE_KEYS, SHAPE_RULES, t, fallbackShape)
    : { value: fallbackShape, confidence: 0.6, probabilities: { [fallbackShape]: 0.6 } as Partial<Record<ShapeKey, number>> };
  const vibe = classify(VIBES, VIBE_RULES, t, "serious");
  const scene = classify(SCENES, SCENE_RULES, t, "none");

  const ruleFired = shapeFired || shell.value !== "unspecified";
  // Nothing matched and nothing word-like → "cannot find X.exe". A plain topic ("sci-fi books") still makes an app.
  const nonsense = ruleFired || detectProgram(t) ? 0 : vowelWords(t).length >= 2 ? 0.3 : 0.95;

  return {
    shell,
    shape,
    vibe,
    scene,
    signals: { nonsense },
    latencyMs: 0,
    model: MOCK_MODEL,
    source: "mock",
  };
}
