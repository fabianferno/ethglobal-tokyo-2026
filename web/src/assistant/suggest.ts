/** Prompts Tappy offers when the desktop sits idle. Each one shows off a different program × shape. */
export const SUGGESTIONS = [
  "minesweeper but about cats",
  "excel of the best ramen in tokyo",
  "paint but roast my monday",
  "weather forecast for my mood",
  "notepad diary of a pirate",
  "doom but the enemies are my emails",
  "3d chart of the tallest buildings",
  "tetris but about sushi",
] as const;

export function pickSuggestion(seen: ReadonlySet<string>, rand: () => number = Math.random): string | null {
  const left = SUGGESTIONS.filter((s) => !seen.has(s));
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}
