/** Live: Gemini data + Jev composes each app step by step. Usage: tsx scripts/compose-smoke.mts [baseUrl] */
const BASE = process.argv[2] ?? "http://localhost:3000";
const PROMPTS = [
  "expense tracker for my tokyo trip", "reading list with what i've finished", "kanban for moving apartments", "habit tracker for this month",
  "ramen spots i want to try", "workout log with my personal bests", "wedding guest list and rsvps", "recipe box with what i can cook tonight",
  "crm for my freelance clients", "plant watering schedule", "travel itinerary for kyoto", "job applications tracker",
  "book club meetings", "home inventory for insurance", "podcast episode planner", "study plan for my exam",
  "bug tracker for my side project", "gift ideas for friends", "running log with weekly distance", "movie watchlist with ratings",
];
type Node = { path: string; type: string | null; collection?: string; bindings?: Record<string, string>; children?: Node[] };
type Tree = { root: Node; bound: boolean };
type Field = { name: string; type: string };
type Data = { collections: { name: string; fields: Field[]; records: unknown[] }[] };
const ui = { selected: {}, filter: {}, sort: {}, tab: {} };
const parts = (n: Node): Node[] => (n.children ? n.children.flatMap(parts) : [n]);

let failed = 0;
const times: number[] = [];
for (const prompt of PROMPTS) {
  const dr = await fetch(`${BASE}/api/content`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
  const { data } = (await dr.json()) as { data?: Data };
  if (!data) { failed++; console.log(`✗ ${prompt}: data ${dr.status}`); continue; }
  const state = { prompt, data, ui, history: [] };
  let tree: Tree | null = null, ms = 0, calls = 0, offline = false;
  for (let i = 0; i < 6; i++) {
    const r = (await (await fetch(`${BASE}/api/compose`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state, tree, prev: null }) })).json()) as { tree: Tree; done: boolean; ms: number; offline: boolean };
    tree = r.tree; ms += r.ms; calls++; offline ||= r.offline;
    if (r.done) break;
  }
  const ps = parts(tree!.root);
  const bad = ps.filter((p) => !p.type || (p.collection && Object.values(p.bindings ?? {}).some((b) => {
    const f = b.includes(":") ? b.split(":")[1] : b;
    const col = data.collections.find((c) => c.name === p.collection)!;
    return !["count", "remove-selected", "clear-selection", "clear-filter"].includes(b) && !col.fields.some((x) => x.name === f);
  })));
  if (offline || bad.length || !tree!.bound) { failed++; console.log(`✗ ${prompt}: offline=${offline} bound=${tree!.bound} bad=${bad.map((b) => b.path).join(",")}`); continue; }
  times.push(ms);
  console.log(`✓ ${prompt}: ${calls} calls · ${ms} ms · ${ps.map((p) => p.type).join(", ")}`);
}
times.sort((a, b) => a - b);
console.log(`\nCompose p50 ${times[Math.floor(times.length / 2)] ?? "-"}ms · p90 ${times[Math.floor(times.length * 0.9)] ?? "-"}ms · ${failed} failed`);
process.exit(failed ? 1 : 0);
