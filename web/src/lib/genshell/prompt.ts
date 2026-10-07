import "server-only";

/**
 * The brief for the model that writes a new shell. A shell is a RENDERER: it turns whatever content
 * shape an app has into a familiar program ("TETRIS.EXE", "SNAKE.EXE"). It is written once and then
 * reused for every prompt that names that program, so it must be generic over the data, never hardcode it.
 */

const SHAPES = `type Fmt = "num" | "pct" | "text";
type Bundle = {
  title: string;               // e.g. "Sushi Tetris"
  subtitle: string;
  table?: { columns: { key: string; label: string; fmt?: Fmt; unit?: string }[]; rows: Record<string, string | number>[] };
  series?: { label: string; unit: string; points: number[] };
  list?: { items: { title: string; subtitle?: string; right?: string; tone?: "up" | "down" | "warn" }[] };
  grid?: { asset: string; mark: number; leverage: number[]; offsets: number[]; cells: { mine: boolean; risk: number /*0..1*/; label: string }[][] };
  gauge?: { value: number /*0..1*/; label: string; caption: string; forecast?: { day: string; value: number }[] };
  scene?: { headline: string; verdict: string; lines: string[]; stats: { label: string; value: string }[]; stamps: string[] };
  doc?: { text: string };
  actions: { id: string; label: string; primary?: boolean }[];
};`;

export function systemPrompt() {
  return `You write one self-contained program ("shell") for Jev OS, a Windows-98-style operating system where anything you type becomes an app.
A shell re-skins the app's content as a familiar program or game. Example: "tetris but about sushi" → falling blocks where each block is a row or item from the content (a sushi), sized by its number; clearing lines reveals the items.

## Output
Return ONLY an HTML body fragment: optional <style>, markup, and ONE inline <script>. No <html>/<head>/<body> tags, no markdown fences, no commentary.
Hard limits: under 45 KB total. Vanilla JS + canvas/DOM only. No external resources of any kind (no CDN, fonts, images by URL, imports). No fetch/XMLHttpRequest/WebSocket/EventSource, no localStorage/sessionStorage/indexedDB/cookies, no eval/new Function, never touch window.parent/top/opener. These are blocked by a sandbox anyway and a violation fails install.

## Runtime API (already defined as window.jev before your script runs)
- jev.onData(cb): cb({ bundle, app }) runs when data arrives and again whenever it changes (the content arrives a moment after the window opens, and again on Regenerate). Re-render from it; keep game state across updates when sensible.
  app = { title, prompt, vibe, preview }. preview=true means a small non-interactive thumbnail: auto-play an attract mode, no input needed.
- jev.ready(): call once, right after your first frame is drawn with data. REQUIRED, within 3 seconds of receiving data.
- jev.action(actionId): ask the OS to run bundle.actions[i].id (e.g. "regenerate" from a button). Only call it on explicit user intent (click/keypress), never automatically.
- jev.fmt.num(n), jev.fmt.pct(n): formatting helpers.

## Data (TypeScript for reference)
${SHAPES}
Any field may be missing. Use whatever is present, in this order of preference: table → list → grid → gauge → scene → series → doc. Show the content on screen (labels, HUD, score, tooltips) so it is the point of the game, not decoration. If the data is empty, show a friendly empty state.
Reading a table: each column's fmt says how to show it (pct is already a percentage, unit like "$" or "kg" goes next to the number). The size or weight of a row is its first number column; its label is its first fmt "text" column.

## Look & feel
Fill the whole viewport (100vw × 100vh, resize with the window), crisp pixel/retro look that matches Windows 98. Available CSS classes: .raised .sunken .btn .title .up .down .mono (Win98 bevels, #c0c0c0 face, navy title gradient). Keyboard + mouse controls, with a one-line hint of the controls. Include a small HUD with bundle.title. Keep it fun: the joke is the familiar program + the content.`;
}

export function userPrompt(opts: { name: string; prompt: string; sample: unknown; retryError?: string }) {
  const sample = JSON.stringify(opts.sample).slice(0, 6000);
  return `Program to build: ${opts.name.toUpperCase()}
The person typed: "${opts.prompt.slice(0, 200)}"
It must work for ANY bundle, not just this one. Here is a real example bundle it will receive:
${sample}
${opts.retryError ? `\nYour previous attempt failed the install check with: ${opts.retryError.slice(0, 400)}\nFix that. Make sure jev.ready() is called after the first frame with data.` : ""}`;
}
