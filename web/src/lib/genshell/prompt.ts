import "server-only";

/**
 * The brief for the model that writes a new shell. A shell is a RENDERER: it turns whatever data
 * shapes a function produced into a familiar program ("TETRIS.EXE", "SNAKE.EXE"). It is written once
 * and then reused for every function × target, so it must be generic over the data, never hardcode it.
 */

const SHAPES = `type Fmt = "usd" | "pct" | "num" | "text" | "token";
type Bundle = {
  title: string;               // e.g. "Portfolio — vitalik.eth · live"
  subtitle: string;
  table?: { columns: { key: string; label: string; fmt?: Fmt }[]; rows: Record<string, string | number>[]; total?: Record<string, string | number> };
  series?: { label: string; unit: "usd" | "pct"; points: number[] };
  list?: { items: { title: string; subtitle?: string; right?: string; tone?: "up" | "down" | "warn" }[] };
  grid?: { asset: string; mark: number; leverage: number[]; offsets: number[]; cells: { mine: boolean; risk: number /*0..1*/; label: string }[][] };
  gauge?: { value: number /*0..1*/; label: string; caption: string };
  scene?: { headline: string; verdict: string; lines: string[]; stats: { label: string; value: string }[]; stamps: string[] };
  settings?: { label: string; value: string }[];
  actions: { id: string; label: string; primary?: boolean }[];
};`;

export function systemPrompt() {
  return `You write one self-contained program ("shell") for Suica OS, a Windows-98-style operating system for crypto apps.
A shell re-skins REAL financial data as a familiar program or game. Example: "tetris but my portfolio" → falling blocks where each block is a token, sized by its value; clearing lines shows real numbers.

## Output
Return ONLY an HTML body fragment: optional <style>, markup, and ONE inline <script>. No <html>/<head>/<body> tags, no markdown fences, no commentary.
Hard limits: under 45 KB total. Vanilla JS + canvas/DOM only. No external resources of any kind (no CDN, fonts, images by URL, imports). No fetch/XMLHttpRequest/WebSocket/EventSource, no localStorage/sessionStorage/indexedDB/cookies, no eval/new Function, never touch window.parent/top/opener. These are blocked by a sandbox anyway and a violation fails install.

## Runtime API (already defined as window.suica before your script runs)
- suica.onData(cb): cb({ bundle, app }) runs when data arrives and again whenever it changes. Re-render from it; keep game state across updates when sensible.
  app = { title, ens, target, prompt, vibe, preview }. preview=true means a small non-interactive thumbnail: auto-play an attract mode, no input needed.
- suica.ready(): call once, right after your first frame is drawn with real data. REQUIRED, within 3 seconds of receiving data.
- suica.propose(actionId): ask the OS to run bundle.actions[i].id (e.g. from a button or an in-game event). The OS shows its own signing dialog; you never move money yourself. Only call it on explicit user intent (click/keypress), never automatically.
- suica.fmt.usd(n), suica.fmt.pct(n): formatting helpers.

## Data (TypeScript for reference)
${SHAPES}
Any field may be missing. Use whatever is present, in this order of preference: table → list → grid → gauge → scene → series. Numbers are REAL: show them on screen (labels, HUD, score, tooltips) so a viewer can check them. Never invent values; if the data is empty, show a friendly empty state.
Reading a table correctly (this matters, the numbers are real money):
- Respect each column's fmt. Only fmt "usd" columns are dollars. fmt "num" is a token AMOUNT (e.g. 10,000,000,000 airdropped tokens), never money: don't format it with $ and never sum it into a dollar total.
- The size/weight of a row is its "value" column if present, else the first fmt "usd" column. Its label is the first fmt "text" column.
- A fmt "pct" column is already a percentage (-48.3 means -48.3%).
- If table.total exists, use it for totals instead of summing yourself.

## Look & feel
Fill the whole viewport (100vw × 100vh, resize with the window), crisp pixel/retro look that matches Windows 98. Available CSS classes: .raised .sunken .btn .title .up .down .mono (Win98 bevels, #c0c0c0 face, navy title gradient). Keyboard + mouse controls, with a one-line hint of the controls. Include a small HUD with bundle.title and the most important real number. Keep it fun: the joke is the familiar program + the real numbers.`;
}

export function userPrompt(opts: { name: string; prompt: string; sample: unknown; retryError?: string }) {
  const sample = JSON.stringify(opts.sample).slice(0, 6000);
  return `Program to build: ${opts.name.toUpperCase()}
The person typed: "${opts.prompt.slice(0, 200)}"
It must work for ANY bundle, not just this one. Here is a real example bundle it will receive:
${sample}
${opts.retryError ? `\nYour previous attempt failed the install check with: ${opts.retryError.slice(0, 400)}\nFix that. Make sure suica.ready() is called after the first frame with data.` : ""}`;
}
