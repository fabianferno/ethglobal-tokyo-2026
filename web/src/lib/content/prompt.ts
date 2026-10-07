import type { ConcreteShell, ShapeKey, Vibe } from "@/lib/intent/types";

export type ContentRequest = { prompt: string; shell: ConcreteShell; shape: ShapeKey; vibe: Vibe; nonce: number };

const PROGRAM: Record<ConcreteShell, string> = {
  excel: "Excel 97 spreadsheet",
  minesweeper: "Minesweeper board",
  doom: "DOOM-style level",
  paint: "MS Paint canvas",
  weather: "Weather app",
  notepad: "Notepad document",
  hologram: "spinning 3D chart",
  explorer: "Windows 98 app window",
};

const SHAPE: Record<ShapeKey, string> = {
  table: "a table: up to 8 columns and 12 rows; cells are short strings; number columns use fmt num or pct with an optional unit like $ or kg",
  list: "a list of up to 10 items, each with a short title, an optional subtitle, an optional right-hand value and a tone (up/down/warn/none)",
  series: "a series of 4 to 60 numbers in time order, with a label and an optional unit",
  gauge: "one value between 0 and 1, a short label and caption, and up to 7 forecast entries (day name + value 0..1)",
  scene: "a poster: a headline under 30 characters, a verdict under 40 characters, 2 to 3 punchy one-liners under 60 characters each, up to 4 short label/value stats and up to 3 one-word stamps",
  grid: "a board of 6 to 8 rows by 6 to 8 columns, every row the same length; each cell has a short label and a danger value 0..1 (above 0.72 is a mine or enemy; make about one cell in six a mine)",
  doc: "a piece of writing up to 2000 characters, plain text with line breaks",
  picture: "a caption for a picture of the subject",
};

/** The instructions Gemini gets for one app window. The person's own words are the user turn, untouched. */
export function buildPrompt(req: ContentRequest): { system: string; user: string } {
  const system = [
    `You write the content for an app inside Jev OS, a retro Windows 98 desktop.`,
    `The app looks like a ${PROGRAM[req.shell]}. Its content must be ${SHAPE[req.shape]}.`,
    `Tone: ${req.vibe}. Keep every string short enough to fit a small window.`,
    `Hard limits: at most 12 rows, 8 columns, 60 points, 10 list items, an 8x8 grid, 2000 characters of text.`,
    `Write about the subject only. Do not mention Windows, Jev OS or computers unless the request is about them.`,
    `Use real, well-known facts when the request is factual; invent freely when it is playful. Never include links or code.`,
    `Reply with JSON only, matching the schema. Title at most 60 characters, subtitle at most 120.`,
  ].join("\n");
  return { system, user: req.prompt };
}
