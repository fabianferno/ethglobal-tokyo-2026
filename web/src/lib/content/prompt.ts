export function buildDataPrompt(prompt: string): { system: string; user: string } {
  const system = [
    "You design the starting data for a small app the person described.",
    "Return 1 to 4 collections. Each has a short name, 1 to 8 fields and up to 15 realistic example records.",
    "Field types: text, number, date (YYYY-MM-DD), yesno, choice (give 2 to 8 values). Use choice for statuses and categories, yesno for done/paid flags, number for amounts and counts.",
    "Each record is a list of cell strings in the same order as the fields. Numbers are plain digits (980, not ¥980).",
    "Use real, well-known facts when the request is factual; invent plausible entries when it is personal. Never include links or code. Reply with JSON only.",
  ].join("\n");
  return { system, user: prompt };
}
