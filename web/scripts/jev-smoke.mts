/** End-to-end check against a running dev server: Jev composes, Gemini fills. Usage: pnpm smoke [baseUrl]  (or ./node_modules/.bin/tsx scripts/jev-smoke.mts [baseUrl]) */
const BASE = process.argv[2] ?? "http://localhost:3000";
const PROMPTS = [
  "minesweeper but about cats", "excel of the best ramen in tokyo", "paint but roast my monday", "weather forecast for my mood",
  "notepad diary of a pirate", "3d chart of the tallest buildings", "top 10 sci-fi books", "doom but the enemies are my emails",
  "a list of weekend hikes near tokyo", "excel comparing coffee brewing methods", "poem about rain in notepad", "chart of world population",
  "pep talk for my exam", "minesweeper of haunted houses", "weather for my productivity", "draw a picture of mt fuji",
  "excel of solar system planets", "list of best anime of 2025", "notepad recipe for onigiri", "paint but a fortune for today",
];

type Intent = { shell: { value: string }; shape: { value: string }; vibe: { value: string }; source: string; latencyMs: number };
const SHAPE_SHELL: Record<string, string> = { table: "excel", list: "explorer", series: "explorer", gauge: "weather", scene: "paint", grid: "minesweeper", doc: "notepad", picture: "paint" };

let failed = 0;
const lat: number[] = [];
for (const prompt of PROMPTS) {
  const i = (await (await fetch(`${BASE}/api/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: prompt }) })).json()) as Intent;
  if (i.source !== "jev") {
    failed++;
    console.log(`✗ ${prompt}: intent source=${i.source}`);
    continue;
  }
  lat.push(i.latencyMs);
  // Routing only: the API validates content per shape whatever the shell.
  const shell = i.shell.value === "unspecified" ? SHAPE_SHELL[i.shape.value] : i.shell.value;
  if (i.shape.value === "picture") {
    console.log(`✓ ${prompt}: ${shell}/picture jev ${i.latencyMs}ms (image route not exercised)`);
    continue;
  }
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/content`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, shell, shape: i.shape.value, vibe: i.vibe.value }) });
  const j = (await r.json()) as { bundle?: { title: string }; error?: string };
  if (!r.ok || !j.bundle) {
    failed++;
    console.log(`✗ ${prompt}: content ${r.status} ${j.error}`);
    continue;
  }
  console.log(`✓ ${prompt}: ${shell}/${i.shape.value} jev ${i.latencyMs}ms · content ${Date.now() - t0}ms · "${j.bundle.title}"`);
}
lat.sort((a, b) => a - b);
console.log(`\nJev p50 ${lat[Math.floor(lat.length / 2)] ?? "-"}ms · p90 ${lat[Math.floor(lat.length * 0.9)] ?? "-"}ms · ${failed} failed`);
process.exit(failed ? 1 : 0);
