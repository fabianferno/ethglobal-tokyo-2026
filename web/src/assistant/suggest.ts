/** Prompts Tappy offers when the desktop sits idle. Each one makes Jev compose a different kind of app. */
export const SUGGESTIONS = [
  "expense tracker for my tokyo trip",
  "reading list with what i've finished",
  "kanban for moving apartments",
  "habit tracker for this month",
  "ramen spots i want to try",
  "workout log with my personal bests",
  "wedding guest list and rsvps",
  "recipe box with what i can cook tonight",
] as const;

export function pickSuggestion(seen: ReadonlySet<string>, rand: () => number = Math.random): string | null {
  const left = SUGGESTIONS.filter((s) => !seen.has(s));
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}
