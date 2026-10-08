# Composed UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Jev OS app is composed from a kit of containers and parts by the OpenAI Decisions API, level by level, and re-composed after every interaction (UI = f(state)).

**Architecture:** Pure, tested modules do the thinking: `lib/kit` (types, catalog, operations, tree), `lib/compose` (state → Decisions questions → tree, fallback). A server route `/api/compose` runs one composer step per request (one Decisions call) so the client can render each level as it lands. Gemini writes the app's starting `Data` once via `/api/content`. React renders the tree from `src/kit`; an app window holds `AppState`, applies operations in code, and re-composes. The old shells, content shapes, intent classifier and generated-program stack are deleted last, so `tsc` stays green until then.

**Tech Stack:** Next.js 16, React 19, TypeScript, zod 4, vitest, OpenAI Decisions API (`POST /v1/decisions`, `gpt-6-luna`), Gemini REST. pnpm only, app in `web/`.

**Spec:** `docs/superpowers/specs/2026-10-09-composed-ui-design.md`

## Global Constraints

- Always `pnpm` / `pnpm exec`; commands run from `web/` unless stated. `pnpm smoke` may be blocked by pnpm's ignored-builds guard: run `./node_modules/.bin/tsx scripts/<file>.mts` instead.
- Caps (code-enforced): depth ≤ 3, ≤ 4 children per container, ≤ 6 parts per app.
- Containers: `split-h-2`, `split-h-3`, `split-v-2`, `split-v-3`, `tabs-2`, `tabs-3`, `grid-4`.
- Parts: `table`, `list`, `detail`, `form`, `stat-row`, `bar-chart`, `line-chart`, `kanban`, `checklist`, `calendar`, `search`, `button-bar`, `note`, `picture`.
- Field types: `text`, `number`, `date`, `yesno`, `choice` (with `values`).
- Gemini data limits: ≤ 4 collections, ≤ 8 fields per collection, ≤ 15 records per collection.
- Operations: `add`, `update`, `remove`, `select`, `filter`, `sort`, `clear` — pure, deterministic, each appends one history line. Jev sees the last 5 history lines.
- Start preview re-composes after a ~300 ms typing pause; search/form inputs change state on submit or a 500 ms pause.
- Decisions: `OPENAI_API_KEY`, model `JEV_MODEL || "gpt-6-luna"`, 4 s timeout per call; on failure the rule-based fallback tree + "offline" chip.
- Rate limit `/api/compose`: 120 calls per client per minute (then fallback).
- Nothing is saved. Never print, log or commit `web/.env.local`.
- Product copy: "Jev" is the composer's name; credit "OpenAI Decisions API (gpt-6-luna)" and Gemini.

## Review Focus

1. **Data with no field of a needed type** (no number field, no choice field) → parts that can't bind are never offered, and a part whose chosen collection can't bind switches to a collection that can. Pinned in Task 4 (`nodeOptions` excludes unbindable parts) and Task 4 (`applyLevel` reassigns collection).
2. **User removes/filters until a collection is empty** → every part renders an empty state, aggregates show 0, nothing throws. Pinned in Task 2 (`aggregate` on empty) and Task 2 (`remove` selected clears selection).
3. **Client sends a tampered or oversized state/tree to `/api/compose`** → 400, never a crash or a huge Decisions bill. Pinned in Task 6 (zod limits test).
4. **Decisions answers with an option we didn't offer, or refuses** → that compose falls back to the rule-based tree with the offline chip. Pinned in Task 4 (`applyLevel` throws on an unknown option) and Task 6 (route returns fallback).
5. **Rapid clicks while a compose is running** → the stale compose is discarded; only the newest state's tree renders. Pinned in Task 7 (`runCompose` honours an abort/generation check).

---

### Task 1: Kit types and catalog

**Files:**
- Create: `web/src/lib/kit/types.ts`, `web/src/lib/kit/catalog.ts`
- Test: `web/src/lib/kit/catalog.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `FieldType`, `Field`, `Value`, `Rec`, `Collection`, `Data`, `UiState`, `AppState`, `CONTAINERS`, `ContainerType`, `PARTS`, `PartType`, `NodeType`, `Bindings`, `TreeNode`, `Tree`, `ACCENTS`, `Accent`
  - `catalog.ts`: `SlotSpec`, `CONTAINER_INFO`, `PART_INFO`, `isContainer(t)`, `childCount(t)`, `slotOptions(slot, col)`, `canBind(part, col)`, `collectionText(col)`

- [ ] **Step 1: Write the failing test**

`web/src/lib/kit/catalog.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { canBind, childCount, isContainer, PART_INFO, slotOptions } from "./catalog";
import { CONTAINERS, PARTS, type Collection } from "./types";

const expenses: Collection = {
  name: "expenses",
  fields: [
    { name: "item", type: "text" },
    { name: "amount", type: "number" },
    { name: "date", type: "date" },
    { name: "category", type: "choice", values: ["food", "travel"] },
    { name: "paid", type: "yesno" },
  ],
  records: [],
};
const notes: Collection = { name: "notes", fields: [{ name: "body", type: "text" }], records: [] };

describe("catalog", () => {
  test("every container and part is described", () => {
    for (const c of CONTAINERS) expect(isContainer(c)).toBe(true);
    for (const p of PARTS) expect(PART_INFO[p].description.length).toBeGreaterThan(10);
    expect(childCount("split-h-3")).toBe(3);
    expect(childCount("grid-4")).toBe(4);
  });

  test("field slots only offer fields of the allowed types", () => {
    const value = PART_INFO["bar-chart"].slots.find((s) => s.name === "value")!;
    expect(slotOptions(value, expenses)).toEqual(["amount"]);
    const column = PART_INFO.kanban.slots.find((s) => s.name === "column")!;
    expect(slotOptions(column, expenses)).toEqual(["category"]);
  });

  test("optional slots offer none", () => {
    const sub = PART_INFO.list.slots.find((s) => s.name === "subtitle")!;
    expect(slotOptions(sub, expenses)).toContain("none");
  });

  test("aggregates and buttons are built from the collection", () => {
    const agg = PART_INFO["stat-row"].slots[0];
    expect(slotOptions(agg, expenses)).toEqual(["count", "sum:amount", "avg:amount"]);
    const btn = PART_INFO["button-bar"].slots[0];
    expect(slotOptions(btn, expenses)).toEqual(expect.arrayContaining(["remove-selected", "clear-selection", "clear-filter", "sort:amount"]));
  });

  test("canBind needs every required slot to have an option", () => {
    expect(canBind("kanban", expenses)).toBe(true);
    expect(canBind("kanban", notes)).toBe(false);
    expect(canBind("note", notes)).toBe(true);
    expect(canBind("picture", notes)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/kit/catalog.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `types.ts`**

```ts
/** The kit's vocabulary: an app's data and state, and the UI tree the Decisions API composes. */

export type FieldType = "text" | "number" | "date" | "yesno" | "choice";
export type Field = { name: string; type: FieldType; values?: string[] };
export type Value = string | number | boolean;
export type Rec = { id: string; [field: string]: Value };
export type Collection = { name: string; fields: Field[]; records: Rec[] };
export type Data = { collections: Collection[] };

export type UiState = {
  selected: Record<string, string | null>;
  filter: Record<string, string>;
  sort: Record<string, { field: string; dir: "asc" | "desc" }>;
  tab: Record<string, number>;
};
export type AppState = { prompt: string; data: Data | null; ui: UiState; history: string[] };

export const CONTAINERS = ["split-h-2", "split-h-3", "split-v-2", "split-v-3", "tabs-2", "tabs-3", "grid-4"] as const;
export type ContainerType = (typeof CONTAINERS)[number];
export const PARTS = ["table", "list", "detail", "form", "stat-row", "bar-chart", "line-chart", "kanban", "checklist", "calendar", "search", "button-bar", "note", "picture"] as const;
export type PartType = (typeof PARTS)[number];
export type NodeType = ContainerType | PartType;

/** slot name → chosen option (a field name, an aggregate like "sum:amount", or a button op). "none" is never stored. */
export type Bindings = Record<string, string>;
/** `type: null` = still open (not decided yet). Paths: "root", "root.0", "root.0.1". */
export type TreeNode = { path: string; type: NodeType | null; collection?: string; bindings?: Bindings; children?: TreeNode[] };
export const ACCENTS = ["navy", "teal", "green", "purple", "maroon", "olive"] as const;
export type Accent = (typeof ACCENTS)[number];
export type Tree = { root: TreeNode; accent: Accent; nonsense: number; bound: boolean };
```

- [ ] **Step 4: Write `catalog.ts`**

```ts
import type { Collection, ContainerType, FieldType, NodeType, PartType } from "./types";

/** A binding slot on a part: a field of given types, an aggregate, or a button operation. */
export type SlotSpec = { name: string; kind: "field" | "agg" | "button"; types?: FieldType[]; optional: boolean; question: string };

export const CONTAINER_INFO: Record<ContainerType, { children: number; description: string }> = {
  "split-h-2": { children: 2, description: "Two panes side by side (left and right)" },
  "split-h-3": { children: 3, description: "Three panes side by side" },
  "split-v-2": { children: 2, description: "Two panes stacked (top and bottom)" },
  "split-v-3": { children: 3, description: "Three panes stacked top to bottom" },
  "tabs-2": { children: 2, description: "Two tabs, one visible at a time" },
  "tabs-3": { children: 3, description: "Three tabs, one visible at a time" },
  "grid-4": { children: 4, description: "A 2x2 grid of four panes, like a dashboard" },
};

const ANY: FieldType[] = ["text", "number", "date", "yesno", "choice"];
const f = (name: string, types: FieldType[], optional: boolean, question: string): SlotSpec => ({ name, kind: "field", types, optional, question });

export const PART_INFO: Record<PartType, { description: string; needsCollection: boolean; slots: SlotSpec[] }> = {
  table: { description: "A table of a collection's records with columns, good for comparing many items", needsCollection: true, slots: [f("col1", ANY, false, "first column"), f("col2", ANY, true, "second column"), f("col3", ANY, true, "third column"), f("col4", ANY, true, "fourth column")] },
  list: { description: "A list of items with a title and a subtitle; clicking one selects it", needsCollection: true, slots: [f("title", ["text"], false, "item title"), f("subtitle", ANY, true, "item subtitle")] },
  detail: { description: "All fields of the currently selected record, for reading one item closely", needsCollection: true, slots: [] },
  form: { description: "Input fields and a submit button that adds a new record", needsCollection: true, slots: [f("field1", ANY, false, "first input"), f("field2", ANY, true, "second input"), f("field3", ANY, true, "third input"), f("field4", ANY, true, "fourth input")] },
  "stat-row": { description: "One to three big numbers: counts, totals or averages", needsCollection: true, slots: [{ name: "agg1", kind: "agg", optional: false, question: "first number" }, { name: "agg2", kind: "agg", optional: true, question: "second number" }, { name: "agg3", kind: "agg", optional: true, question: "third number" }] },
  "bar-chart": { description: "A bar chart comparing a number across items", needsCollection: true, slots: [f("label", ["text", "choice"], false, "bar labels"), f("value", ["number"], false, "bar values")] },
  "line-chart": { description: "A line chart of a number over time or order, for trends", needsCollection: true, slots: [f("value", ["number"], false, "the number to plot"), f("order", ["date"], true, "the time axis")] },
  kanban: { description: "Cards in columns by status; cards can be moved between columns", needsCollection: true, slots: [f("column", ["choice"], false, "which field makes the columns"), f("title", ["text"], false, "card title")] },
  checklist: { description: "Items with checkboxes that can be ticked done", needsCollection: true, slots: [f("title", ["text"], false, "item title"), f("done", ["yesno"], false, "the done checkbox")] },
  calendar: { description: "A month calendar with items on their dates", needsCollection: true, slots: [f("date", ["date"], false, "the date of each item"), f("title", ["text"], false, "item title")] },
  search: { description: "A search box that filters a collection", needsCollection: true, slots: [f("field", ["text", "choice"], false, "the field to search")] },
  "button-bar": { description: "One to three buttons that act on a collection (remove, clear, sort)", needsCollection: true, slots: [{ name: "btn1", kind: "button", optional: false, question: "first button" }, { name: "btn2", kind: "button", optional: true, question: "second button" }, { name: "btn3", kind: "button", optional: true, question: "third button" }] },
  note: { description: "A paragraph of text, like notes, a description or a summary", needsCollection: true, slots: [f("text", ["text"], false, "the text to show")] },
  picture: { description: "A picture of the app's subject, for mood or decoration", needsCollection: false, slots: [] },
};

export const isContainer = (t: NodeType): t is ContainerType => t in CONTAINER_INFO;
export const childCount = (t: ContainerType) => CONTAINER_INFO[t].children;

/** The options a slot offers for this collection: type-filtered fields, aggregates or button ops, plus "none" if optional. */
export function slotOptions(slot: SlotSpec, col: Collection): string[] {
  let out: string[];
  if (slot.kind === "field") out = col.fields.filter((x) => slot.types!.includes(x.type)).map((x) => x.name);
  else if (slot.kind === "agg") out = ["count", ...col.fields.filter((x) => x.type === "number").flatMap((x) => [`sum:${x.name}`, `avg:${x.name}`])];
  else out = ["remove-selected", "clear-selection", "clear-filter", ...col.fields.filter((x) => x.type !== "yesno").map((x) => `sort:${x.name}`)];
  return slot.optional ? [...out, "none"] : out;
}

/** Every required slot has at least one option. */
export function canBind(part: PartType, col: Collection): boolean {
  return PART_INFO[part].slots.every((s) => s.optional || slotOptions(s, col).length > 0);
}

/** "expenses: item (text), amount (number), category (choice: food, travel)" */
export function collectionText(col: Collection): string {
  return `${col.name}: ${col.fields.map((x) => `${x.name} (${x.type}${x.values ? `: ${x.values.join(", ")}` : ""})`).join(", ")}`;
}
```

- [ ] **Step 5: Run tests** — `pnpm test src/lib/kit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/kit
git commit -m "Kit: types and catalog of containers, parts and binding slots"
```

---

### Task 2: Operations

**Files:**
- Create: `web/src/lib/kit/ops.ts`
- Test: `web/src/lib/kit/ops.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `type Op = { kind: "add"; collection: string; values: Record<string, string> } | { kind: "update"; collection: string; id: string; field: string; value: Value } | { kind: "remove"; collection: string; id: string } | { kind: "select"; collection: string; id: string | null } | { kind: "filter"; collection: string; query: string; field: string } | { kind: "sort"; collection: string; field: string } | { kind: "clear"; collection: string; what: "selection" | "filter" }`
  - `emptyUi(): UiState`
  - `applyOp(state: AppState, op: Op, makeId?: () => string): AppState`
  - `visibleRecords(col: Collection, ui: UiState): Rec[]`
  - `aggregate(col: Collection, ui: UiState, agg: string): number`
  - `recordLabel(col: Collection, rec: Rec): string`
  - `HISTORY_KEEP = 20`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { aggregate, applyOp, emptyUi, visibleRecords } from "./ops";
import type { AppState } from "./types";

const base = (): AppState => ({
  prompt: "expense tracker",
  ui: emptyUi(),
  history: [],
  data: {
    collections: [
      {
        name: "expenses",
        fields: [
          { name: "item", type: "text" },
          { name: "amount", type: "number" },
          { name: "category", type: "choice", values: ["food", "travel"] },
          { name: "paid", type: "yesno" },
        ],
        records: [
          { id: "a", item: "ramen", amount: 980, category: "food", paid: true },
          { id: "b", item: "train", amount: 2000, category: "travel", paid: false },
        ],
      },
    ],
  },
});
const col = (s: AppState) => s.data!.collections[0];

describe("ops", () => {
  test("add coerces input by field type and writes history", () => {
    const s = applyOp(base(), { kind: "add", collection: "expenses", values: { item: "sushi", amount: "¥1,250", category: "nope", paid: "yes" } }, () => "c");
    expect(col(s).records.at(-1)).toEqual({ id: "c", item: "sushi", amount: 1250, category: "food", paid: true });
    expect(s.history.at(-1)).toBe('added "sushi" to expenses');
  });

  test("update, remove (clears selection of the removed record), select", () => {
    let s = applyOp(base(), { kind: "select", collection: "expenses", id: "a" });
    expect(s.ui.selected.expenses).toBe("a");
    expect(s.history.at(-1)).toBe('selected "ramen" in expenses');
    s = applyOp(s, { kind: "update", collection: "expenses", id: "b", field: "paid", value: true });
    expect(col(s).records[1].paid).toBe(true);
    s = applyOp(s, { kind: "remove", collection: "expenses", id: "a" });
    expect(col(s).records.map((r) => r.id)).toEqual(["b"]);
    expect(s.ui.selected.expenses).toBeNull();
  });

  test("filter and sort shape the visible records; clear resets", () => {
    let s = applyOp(base(), { kind: "filter", collection: "expenses", query: "TRA", field: "item" });
    expect(visibleRecords(col(s), s.ui).map((r) => r.id)).toEqual(["b"]);
    s = applyOp(s, { kind: "clear", collection: "expenses", what: "filter" });
    s = applyOp(s, { kind: "sort", collection: "expenses", field: "amount" });
    expect(visibleRecords(col(s), s.ui).map((r) => r.id)).toEqual(["a", "b"]);
    s = applyOp(s, { kind: "sort", collection: "expenses", field: "amount" });
    expect(visibleRecords(col(s), s.ui).map((r) => r.id)).toEqual(["b", "a"]);
    expect(s.history.at(-1)).toBe("sorted expenses by amount (desc)");
  });

  test("aggregates respect the filter and are 0 on empty", () => {
    const s = base();
    expect(aggregate(col(s), s.ui, "count")).toBe(2);
    expect(aggregate(col(s), s.ui, "sum:amount")).toBe(2980);
    expect(aggregate(col(s), s.ui, "avg:amount")).toBe(1490);
    const f = applyOp(s, { kind: "filter", collection: "expenses", query: "zzz", field: "item" });
    expect(aggregate(col(f), f.ui, "avg:amount")).toBe(0);
    expect(aggregate(col(f), f.ui, "count")).toBe(0);
  });

  test("ops on an unknown collection or record leave state unchanged", () => {
    const s = base();
    expect(applyOp(s, { kind: "remove", collection: "nope", id: "a" })).toBe(s);
    expect(applyOp(s, { kind: "update", collection: "expenses", id: "zz", field: "paid", value: true })).toBe(s);
  });

  test("history keeps the last 20 lines", () => {
    let s = base();
    for (let i = 0; i < 25; i++) s = applyOp(s, { kind: "select", collection: "expenses", id: i % 2 ? "a" : "b" });
    expect(s.history).toHaveLength(20);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test src/lib/kit/ops.test.ts` → FAIL.

- [ ] **Step 3: Implement `ops.ts`**

```ts
import type { AppState, Collection, Field, Rec, UiState, Value } from "./types";

export type Op =
  | { kind: "add"; collection: string; values: Record<string, string> }
  | { kind: "update"; collection: string; id: string; field: string; value: Value }
  | { kind: "remove"; collection: string; id: string }
  | { kind: "select"; collection: string; id: string | null }
  | { kind: "filter"; collection: string; query: string; field: string }
  | { kind: "sort"; collection: string; field: string }
  | { kind: "clear"; collection: string; what: "selection" | "filter" };

export const HISTORY_KEEP = 20;
export const emptyUi = (): UiState => ({ selected: {}, filter: {}, sort: {}, tab: {} });

let seq = 0;
const defaultId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Text a person typed → a value of the field's type. */
export function coerce(field: Field, raw: string | undefined): Value {
  const s = (raw ?? "").trim();
  switch (field.type) {
    case "number": {
      const n = Number(s.replace(/[,\s¥$€£₹%]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
    case "yesno":
      return /^(y|yes|true|1|on|done|x)$/i.test(s);
    case "choice":
      return field.values?.find((v) => v.toLowerCase() === s.toLowerCase()) ?? field.values?.[0] ?? s;
    default:
      return s;
  }
}

/** The human name of a record: its first text field. */
export function recordLabel(col: Collection, rec: Rec): string {
  const t = col.fields.find((x) => x.type === "text");
  return String(t ? rec[t.name] : rec.id);
}

export function visibleRecords(col: Collection, ui: UiState): Rec[] {
  const q = ui.filter[col.name]?.toLowerCase().trim();
  const filterField = ui.filter[`${col.name}:field`];
  let out = q
    ? col.records.filter((r) => (filterField ? [r[filterField]] : Object.values(r)).some((v) => String(v).toLowerCase().includes(q)))
    : col.records;
  const s = ui.sort[col.name];
  if (s) {
    out = [...out].sort((a, b) => {
      const x = a[s.field], y = b[s.field];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return s.dir === "asc" ? c : -c;
    });
  }
  return out;
}

export function aggregate(col: Collection, ui: UiState, agg: string): number {
  const recs = visibleRecords(col, ui);
  if (agg === "count") return recs.length;
  const [kind, field] = agg.split(":");
  const nums = recs.map((r) => Number(r[field])).filter((n) => Number.isFinite(n));
  const sum = nums.reduce((a, b) => a + b, 0);
  if (kind === "sum") return sum;
  if (kind === "avg") return nums.length ? Math.round((sum / nums.length) * 100) / 100 : 0;
  return 0;
}

function withCollection(state: AppState, name: string, fn: (c: Collection) => Collection | null): AppState | null {
  const cols = state.data?.collections;
  const i = cols?.findIndex((c) => c.name === name) ?? -1;
  if (!cols || i < 0) return null;
  const next = fn(cols[i]);
  if (!next) return null;
  return { ...state, data: { collections: cols.map((c, j) => (j === i ? next : c)) } };
}

const log = (s: AppState, line: string): AppState => ({ ...s, history: [...s.history, line].slice(-HISTORY_KEEP) });

export function applyOp(state: AppState, op: Op, makeId: () => string = defaultId): AppState {
  const col = state.data?.collections.find((c) => c.name === op.collection);
  if (!col) return state;
  switch (op.kind) {
    case "add": {
      const rec: Rec = { id: makeId() };
      for (const f of col.fields) rec[f.name] = coerce(f, op.values[f.name]);
      const s = withCollection(state, col.name, (c) => ({ ...c, records: [...c.records, rec] }))!;
      return log(s, `added "${recordLabel(col, rec)}" to ${col.name}`);
    }
    case "update": {
      const rec = col.records.find((r) => r.id === op.id);
      if (!rec || !col.fields.some((f) => f.name === op.field)) return state;
      const s = withCollection(state, col.name, (c) => ({ ...c, records: c.records.map((r) => (r.id === op.id ? { ...r, [op.field]: op.value } : r)) }))!;
      return log(s, `set ${op.field} to ${String(op.value)} on "${recordLabel(col, rec)}" in ${col.name}`);
    }
    case "remove": {
      const rec = col.records.find((r) => r.id === op.id);
      if (!rec) return state;
      const s = withCollection(state, col.name, (c) => ({ ...c, records: c.records.filter((r) => r.id !== op.id) }))!;
      const ui = s.ui.selected[col.name] === op.id ? { ...s.ui, selected: { ...s.ui.selected, [col.name]: null } } : s.ui;
      return log({ ...s, ui }, `removed "${recordLabel(col, rec)}" from ${col.name}`);
    }
    case "select": {
      const rec = op.id ? col.records.find((r) => r.id === op.id) : null;
      if (op.id && !rec) return state;
      const s = { ...state, ui: { ...state.ui, selected: { ...state.ui.selected, [col.name]: op.id } } };
      return log(s, rec ? `selected "${recordLabel(col, rec)}" in ${col.name}` : `cleared the selection in ${col.name}`);
    }
    case "filter": {
      const q = op.query.trim();
      const filter = { ...state.ui.filter, [col.name]: q, [`${col.name}:field`]: op.field };
      return log({ ...state, ui: { ...state.ui, filter } }, q ? `filtered ${col.name} by "${q}"` : `cleared the filter on ${col.name}`);
    }
    case "sort": {
      const cur = state.ui.sort[col.name];
      const dir: "asc" | "desc" = cur?.field === op.field && cur.dir === "asc" ? "desc" : "asc";
      return log({ ...state, ui: { ...state.ui, sort: { ...state.ui.sort, [col.name]: { field: op.field, dir } } } }, `sorted ${col.name} by ${op.field} (${dir})`);
    }
    case "clear": {
      if (op.what === "selection") return log({ ...state, ui: { ...state.ui, selected: { ...state.ui.selected, [col.name]: null } } }, `cleared the selection in ${col.name}`);
      const filter = { ...state.ui.filter, [col.name]: "" };
      return log({ ...state, ui: { ...state.ui, filter } }, `cleared the filter on ${col.name}`);
    }
  }
}
```

- [ ] **Step 4: Run tests** — `pnpm test src/lib/kit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/kit/ops.ts web/src/lib/kit/ops.test.ts
git commit -m "Kit: deterministic operations on app state"
```

---

### Task 3: Tree helpers

**Files:**
- Create: `web/src/lib/kit/tree.ts`
- Test: `web/src/lib/kit/tree.test.ts`

**Interfaces:**
- Consumes: Task 1 (`isContainer`, `childCount`, `canBind`, `PART_INFO`, types).
- Produces: `MAX_DEPTH = 3`, `MAX_PARTS = 6`, `emptyTree(): Tree`, `depthOf(path)`, `findNode(tree, path)`, `openNodes(tree): TreeNode[]`, `partNodes(tree): TreeNode[]`, `nodeOptions(tree, node, data): NodeType[]`, `setNode(tree, path, patch: Partial<TreeNode>): Tree`, `isComplete(tree)`, `nodeKey(node)`, `treeText(tree)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { emptyTree, isComplete, nodeKey, nodeOptions, openNodes, partNodes, setNode, treeText } from "./tree";
import type { Data } from "./types";

const data: Data = { collections: [{ name: "notes", fields: [{ name: "body", type: "text" }], records: [] }] };

describe("tree", () => {
  test("a container opens its children; parts close the node", () => {
    let t = setNode(emptyTree(), "root", { type: "split-h-2" });
    expect(openNodes(t).map((n) => n.path)).toEqual(["root.0", "root.1"]);
    t = setNode(t, "root.0", { type: "list", collection: "notes" });
    t = setNode(t, "root.1", { type: "detail", collection: "notes" });
    expect(isComplete(t)).toBe(true);
    expect(partNodes(t).map((n) => n.type)).toEqual(["list", "detail"]);
    expect(treeText(t)).toBe("root=split-h-2 [root.0=list(notes), root.1=detail(notes)]");
  });

  test("depth 3 offers parts only", () => {
    let t = setNode(emptyTree(), "root", { type: "split-h-2" });
    t = setNode(t, "root.0", { type: "split-v-2" });
    const deep = openNodes(t).find((n) => n.path === "root.0.0")!;
    expect(nodeOptions(t, deep, null).some((o) => o.startsWith("split") || o.startsWith("tabs") || o === "grid-4")).toBe(false);
  });

  test("containers that would exceed 6 parts are not offered", () => {
    let t = setNode(emptyTree(), "root", { type: "grid-4" });
    // 4 open cells, each will hold ≥ 1 part: the 3 others commit 3, so one cell may hold at most 6 - 3 = 3.
    const cell = openNodes(t)[0];
    const opts = nodeOptions(t, cell, null);
    expect(opts).toContain("split-h-3");
    expect(opts).not.toContain("grid-4");
    // root.0 becomes 3 panes: 3 + 3 other cells = 6 committed → root.1 can't split at all.
    t = setNode(t, "root.0", { type: "split-h-3" });
    expect(nodeOptions(t, openNodes(t).find((n) => n.path === "root.1")!, null)).not.toContain("split-h-2");
  });

  test("with data, parts no collection can bind are not offered", () => {
    const opts = nodeOptions(emptyTree(), emptyTree().root, data);
    expect(opts).toContain("note");
    expect(opts).not.toContain("kanban");
    expect(opts).not.toContain("bar-chart");
    expect(opts).toContain("picture");
  });

  test("nodeKey changes with type or bindings, not with unrelated nodes", () => {
    const a = { path: "root.0", type: "list" as const, collection: "notes", bindings: { title: "body" } };
    expect(nodeKey(a)).toBe(nodeKey({ ...a }));
    expect(nodeKey(a)).not.toBe(nodeKey({ ...a, bindings: { title: "other" } }));
    expect(nodeKey(a)).not.toBe(nodeKey({ ...a, type: "table" }));
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `tree.ts`**

```ts
import { canBind, childCount, isContainer, PART_INFO } from "./catalog";
import { CONTAINERS, type Data, type NodeType, PARTS, type Tree, type TreeNode } from "./types";

export const MAX_DEPTH = 3;
export const MAX_PARTS = 6;

export const emptyTree = (): Tree => ({ root: { path: "root", type: null }, accent: "navy", nonsense: 0, bound: false });
export const depthOf = (path: string) => path.split(".").length;

function walk(n: TreeNode, fn: (n: TreeNode) => void) {
  fn(n);
  n.children?.forEach((c) => walk(c, fn));
}
const all = (t: Tree) => {
  const out: TreeNode[] = [];
  walk(t.root, (n) => out.push(n));
  return out;
};

export const findNode = (t: Tree, path: string) => all(t).find((n) => n.path === path) ?? null;
export const openNodes = (t: Tree) => all(t).filter((n) => n.type === null);
export const partNodes = (t: Tree) => all(t).filter((n) => n.type !== null && !isContainer(n.type));
export const isComplete = (t: Tree) => openNodes(t).length === 0;

/** What this open node may become: depth and part-budget caps, and (with data) only parts some collection can bind. */
export function nodeOptions(t: Tree, node: TreeNode, data: Data | null): NodeType[] {
  // Every other open node will hold at least one part; decided parts already count.
  const committed = partNodes(t).length + openNodes(t).filter((n) => n.path !== node.path).length;
  const containers = depthOf(node.path) >= MAX_DEPTH ? [] : CONTAINERS.filter((c) => committed + childCount(c) <= MAX_PARTS);
  const parts = data ? PARTS.filter((p) => !PART_INFO[p].needsCollection || data.collections.some((c) => canBind(p, c))) : [...PARTS];
  return [...containers, ...parts];
}

function patchAt(n: TreeNode, path: string, patch: Partial<TreeNode>): TreeNode {
  if (n.path === path) {
    const next = { ...n, ...patch };
    if (patch.type && isContainer(patch.type)) next.children = Array.from({ length: childCount(patch.type) }, (_, i) => ({ path: `${path}.${i}`, type: null }));
    else if (patch.type) delete next.children;
    return next;
  }
  return n.children ? { ...n, children: n.children.map((c) => patchAt(c, path, patch)) } : n;
}
export const setNode = (t: Tree, path: string, patch: Partial<TreeNode>): Tree => ({ ...t, root: patchAt(t.root, path, patch) });

/** Identity for diffing: same key → keep the rendered component. */
export function nodeKey(n: TreeNode): string {
  const b = n.bindings ? Object.keys(n.bindings).sort().map((k) => `${k}=${n.bindings![k]}`).join(",") : "";
  return `${n.path}|${n.type ?? "?"}|${n.collection ?? ""}|${b}`;
}

/** "root=split-h-2 [root.0=list(notes), root.1=?]" — how Jev sees a tree. */
export function treeText(t: Tree): string {
  const one = (n: TreeNode): string => {
    const self = `${n.path}=${n.type ?? "?"}${n.collection ? `(${n.collection})` : ""}`;
    return n.children ? `${self} [${n.children.map(one).join(", ")}]` : self;
  };
  return one(t.root);
}
```

- [ ] **Step 4: Run tests** — `pnpm test src/lib/kit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/kit/tree.ts web/src/lib/kit/tree.test.ts
git commit -m "Kit: tree helpers with depth and part-budget caps"
```

---

### Task 4: Composer questions, answers and fallback

**Files:**
- Create: `web/src/lib/decisions/types.ts`
- Create: `web/src/lib/compose/describe.ts`, `web/src/lib/compose/questions.ts`, `web/src/lib/compose/fallback.ts`
- Test: `web/src/lib/compose/questions.test.ts`, `web/src/lib/compose/fallback.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `decisions/types.ts`: `ChoiceQuestion`, `PredicateQuestion`, `Question`, `DecisionAnswer`
  - `describe(state: AppState, tree: Tree, prev: Tree | null): string`
  - `levelQuestions(state, tree): Question[]`, `applyLevel(state, tree, answers): Tree` (throws `ComposeError` on an unknown option)
  - `bindQuestions(state, tree): Question[]`, `applyBind(state, tree, answers): Tree` (sets `bound: true`)
  - `class ComposeError extends Error`
  - `fallbackTree(state): Tree` (complete; bound when data exists)

- [ ] **Step 1: Write the failing tests**

`questions.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { emptyTree, isComplete, setNode } from "@/lib/kit/tree";
import type { AppState, Data } from "@/lib/kit/types";
import type { DecisionAnswer } from "@/lib/decisions/types";
import { applyBind, applyLevel, bindQuestions, ComposeError, levelQuestions } from "./questions";
import { describe as describeState } from "./describe";

const data: Data = {
  collections: [
    { name: "expenses", fields: [{ name: "item", type: "text" }, { name: "amount", type: "number" }, { name: "category", type: "choice", values: ["food", "travel"] }], records: [{ id: "a", item: "ramen", amount: 980, category: "food" }] },
    { name: "budget", fields: [{ name: "label", type: "text" }, { name: "limit", type: "number" }], records: [] },
  ],
};
const st = (d: Data | null): AppState => ({ prompt: "expense tracker for my tokyo trip", data: d, ui: emptyUi(), history: ["added \"ramen\" to expenses"] });
const choice = (name: string, c: string): DecisionAnswer => ({ type: "choice", name, choice: c, probabilities: [] });

describe("level questions", () => {
  test("first call: root node + accent + nonsense; no collection question without data", () => {
    const qs = levelQuestions(st(null), emptyTree());
    expect(qs.map((q) => q.name)).toEqual(["node:root", "accent", "nonsense"]);
  });

  test("with 2+ collections each open node also gets a collection question", () => {
    const t = setNode(emptyTree(), "root", { type: "split-h-2" });
    const qs = levelQuestions(st(data), t);
    expect(qs.map((q) => q.name)).toEqual(["node:root.0", "collection:root.0", "node:root.1", "collection:root.1"]);
  });

  test("applyLevel sets types, opens children, records accent and nonsense", () => {
    const t = applyLevel(st(null), emptyTree(), [choice("node:root", "split-h-2"), choice("accent", "teal"), { type: "predicate", name: "nonsense", probability: 0.02 }]);
    expect(t.root.type).toBe("split-h-2");
    expect(t.accent).toBe("teal");
    expect(t.nonsense).toBe(0.02);
    expect(t.root.children).toHaveLength(2);
  });

  test("a part whose chosen collection can't bind it moves to one that can", () => {
    const t0 = setNode(emptyTree(), "root", { type: "split-h-2" });
    const t = applyLevel(st(data), t0, [choice("node:root.0", "bar-chart"), choice("collection:root.0", "budget"), choice("node:root.1", "list"), choice("collection:root.1", "budget")]);
    // budget has text + number, so bar-chart can bind there; list too.
    expect(t.root.children![0].collection).toBe("budget");
    const t2 = applyLevel(st(data), t0, [choice("node:root.0", "kanban"), choice("collection:root.0", "budget"), choice("node:root.1", "list"), choice("collection:root.1", "expenses")]);
    expect(t2.root.children![0].collection).toBe("expenses"); // only expenses has a choice field
  });

  test("an option we didn't offer, or a refusal, is a ComposeError", () => {
    expect(() => applyLevel(st(null), emptyTree(), [choice("node:root", "carousel"), choice("accent", "teal"), { type: "predicate", name: "nonsense", probability: 0 }])).toThrow(ComposeError);
    expect(() => applyLevel(st(null), emptyTree(), [{ type: "refusal", name: "node:root" }, choice("accent", "teal"), { type: "predicate", name: "nonsense", probability: 0 }])).toThrow(ComposeError);
  });
});

describe("bind questions", () => {
  const tree = () => {
    let t = setNode(emptyTree(), "root", { type: "split-h-2" });
    t = setNode(t, "root.0", { type: "stat-row", collection: "expenses" });
    t = setNode(t, "root.1", { type: "bar-chart", collection: "expenses" });
    return t;
  };

  test("one question per slot, options type-filtered, single-option required slots auto-filled", () => {
    const qs = bindQuestions(st(data), tree());
    const names = qs.map((q) => q.name);
    expect(names).toContain("bind:root.0:agg1");
    expect(names).not.toContain("bind:root.1:value"); // only "amount" fits → auto
    const agg = qs.find((q) => q.name === "bind:root.0:agg1")!;
    expect(agg.type === "choice" && agg.choices.map((c) => c.value)).toEqual(["count", "sum:amount", "avg:amount"]);
  });

  test("applyBind stores bindings (none omitted) and marks the tree bound", () => {
    const t = applyBind(st(data), tree(), [
      choice("bind:root.0:agg1", "sum:amount"), choice("bind:root.0:agg2", "count"), choice("bind:root.0:agg3", "none"),
      choice("bind:root.1:label", "item"),
    ]);
    expect(t.bound).toBe(true);
    expect(t.root.children![0].bindings).toEqual({ agg1: "sum:amount", agg2: "count" });
    expect(t.root.children![1].bindings).toEqual({ label: "item", value: "amount" });
    expect(isComplete(t)).toBe(true);
  });
});

test("describe() shows prompt, schema, ui, recent history and the tree so far", () => {
  const text = describeState(st(data), setNode(emptyTree(), "root", { type: "split-h-2" }), null);
  expect(text).toContain('App: "expense tracker for my tokyo trip"');
  expect(text).toContain("expenses (1 record): item (text), amount (number), category (choice: food, travel)");
  expect(text).toContain('added "ramen" to expenses');
  expect(text).toContain("Layout so far: root=split-h-2 [root.0=?, root.1=?]");
});
```

`fallback.test.ts`:
```ts
import { expect, test } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { isComplete, partNodes } from "@/lib/kit/tree";
import { fallbackTree } from "./fallback";

const st = (fields: { name: string; type: "text" | "number" | "choice"; values?: string[] }[]) => ({
  prompt: "x", ui: emptyUi(), history: [],
  data: { collections: [{ name: "items", fields, records: [] }] },
});

test("choice field → list + detail; otherwise table + form; always complete and bound", () => {
  const a = fallbackTree(st([{ name: "title", type: "text" }, { name: "status", type: "choice", values: ["todo", "done"] }]));
  expect(partNodes(a).map((n) => n.type)).toEqual(["list", "detail"]);
  expect(a.bound && isComplete(a)).toBe(true);
  const b = fallbackTree(st([{ name: "title", type: "text" }, { name: "amount", type: "number" }]));
  expect(partNodes(b).map((n) => n.type)).toEqual(["table", "form"]);
  expect(b.root.children![0].bindings).toEqual({ col1: "title", col2: "amount" });
});

test("without data: a complete, unbound placeholder tree", () => {
  const t = fallbackTree({ prompt: "x", ui: emptyUi(), history: [], data: null });
  expect(isComplete(t)).toBe(true);
  expect(t.bound).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test src/lib/compose` → FAIL.

- [ ] **Step 3: `decisions/types.ts`**

```ts
export type ChoiceQuestion = { type: "choice"; name: string; instructions: string; choices: { value: string; description: string }[] };
export type PredicateQuestion = { type: "predicate"; name: string; instructions: string };
export type Question = ChoiceQuestion | PredicateQuestion;
export type DecisionAnswer =
  | { type: "choice"; name: string; choice: string; confidence?: number; probabilities: (number | { value: string; probability: number })[] }
  | { type: "predicate"; name: string; probability: number }
  | { type: "score" | "refusal"; name: string };
```

- [ ] **Step 4: `compose/describe.ts`**

```ts
import { collectionText } from "@/lib/kit/catalog";
import { recordLabel } from "@/lib/kit/ops";
import { treeText } from "@/lib/kit/tree";
import type { AppState, Tree } from "@/lib/kit/types";

/** Everything Jev sees for one call, as compact text. Sample rows, not all rows. */
export function describe(state: AppState, tree: Tree, prev: Tree | null): string {
  const lines = [`App: "${state.prompt}"`];
  if (state.data) {
    lines.push("Data:");
    for (const c of state.data.collections) {
      const n = c.records.length;
      lines.push(`- ${collectionText(c).replace(`${c.name}:`, `${c.name} (${n} record${n === 1 ? "" : "s"}):`)}`);
      for (const r of c.records.slice(0, 3)) lines.push(`  e.g. ${c.fields.map((f) => `${f.name}=${String(r[f.name])}`).join(", ")}`);
    }
    const ui: string[] = [];
    for (const c of state.data.collections) {
      const sel = state.ui.selected[c.name];
      const rec = sel ? c.records.find((r) => r.id === sel) : null;
      if (rec) ui.push(`selected "${recordLabel(c, rec)}" in ${c.name}`);
      if (state.ui.filter[c.name]) ui.push(`${c.name} filtered by "${state.ui.filter[c.name]}"`);
      const s = state.ui.sort[c.name];
      if (s) ui.push(`${c.name} sorted by ${s.field} ${s.dir}`);
    }
    if (ui.length) lines.push(`Now: ${ui.join("; ")}`);
  } else lines.push("Data: not written yet (design the layout from the request alone).");
  if (state.history.length) lines.push("Recent:", ...state.history.slice(-5).map((h) => `- ${h}`));
  if (prev) lines.push(`Previous layout: ${treeText(prev)}`);
  lines.push(`Layout so far: ${treeText(tree)}`);
  return lines.join("\n");
}
```

- [ ] **Step 5: `compose/questions.ts`**

```ts
import { canBind, CONTAINER_INFO, isContainer, PART_INFO, slotOptions } from "@/lib/kit/catalog";
import { findNode, nodeOptions, openNodes, partNodes, setNode } from "@/lib/kit/tree";
import { ACCENTS, type AppState, type Bindings, type NodeType, type PartType, type Tree, type TreeNode } from "@/lib/kit/types";
import type { DecisionAnswer, Question } from "@/lib/decisions/types";

export class ComposeError extends Error {}

const ACCENT_TEXT: Record<(typeof ACCENTS)[number], string> = {
  navy: "Calm, classic, work-like", teal: "Fresh, travel, water", green: "Money, health, growth",
  purple: "Creative, playful, night", maroon: "Warm, food, serious", olive: "Outdoors, earthy, slow",
};

/** "the right pane of a side-by-side split" — where a node sits, in words. */
export function placeText(tree: Tree, path: string): string {
  if (path === "root") return "the whole app window";
  const parentPath = path.slice(0, path.lastIndexOf("."));
  const i = Number(path.slice(path.lastIndexOf(".") + 1));
  const parent = findNode(tree, parentPath)!;
  const t = parent.type!;
  const n = CONTAINER_INFO[t as keyof typeof CONTAINER_INFO]?.children ?? 0;
  const where = t.startsWith("split-h") ? `pane ${i + 1} of ${n}, side by side` : t.startsWith("split-v") ? `pane ${i + 1} of ${n}, stacked top to bottom` : t.startsWith("tabs") ? `tab ${i + 1} of ${n}` : `cell ${i + 1} of a 2x2 grid`;
  return `${where}, inside ${placeText(tree, parentPath)}`;
}

const describeType = (t: NodeType) => (isContainer(t) ? CONTAINER_INFO[t].description : PART_INFO[t].description);

export function levelQuestions(state: AppState, tree: Tree): Question[] {
  const qs: Question[] = [];
  const cols = state.data?.collections ?? [];
  for (const node of openNodes(tree)) {
    qs.push({
      type: "choice",
      name: `node:${node.path}`,
      instructions: `What should ${placeText(tree, node.path)} be? Pick a container to split it further, or a part to show something.`,
      choices: nodeOptions(tree, node, state.data).map((t) => ({ value: t, description: describeType(t) })),
    });
    if (cols.length >= 2)
      qs.push({
        type: "choice",
        name: `collection:${node.path}`,
        instructions: `If ${placeText(tree, node.path)} shows data, which collection should it show?`,
        choices: cols.map((c) => ({ value: c.name, description: `${c.name}: ${c.fields.map((f) => f.name).join(", ")}` })),
      });
  }
  if (tree.root.type === null) {
    qs.push({ type: "choice", name: "accent", instructions: "Which accent colour fits this app?", choices: ACCENTS.map((a) => ({ value: a, description: ACCENT_TEXT[a] })) });
    qs.push({ type: "predicate", name: "nonsense", instructions: "The request is gibberish or is not a request for any kind of app" });
  }
  return qs;
}

function pick(answers: DecisionAnswer[], name: string, allowed: string[]): string {
  const a = answers.find((x) => x.name === name);
  if (!a || a.type !== "choice" || !allowed.includes(a.choice)) throw new ComposeError(`no usable answer for ${name}`);
  return a.choice;
}

export function applyLevel(state: AppState, tree: Tree, answers: DecisionAnswer[]): Tree {
  let t = tree;
  const cols = state.data?.collections ?? [];
  for (const node of openNodes(tree)) {
    const type = pick(answers, `node:${node.path}`, nodeOptions(tree, node, state.data)) as NodeType;
    let collection: string | undefined;
    if (!isContainer(type) && PART_INFO[type].needsCollection && cols.length) {
      const asked = cols.length >= 2 ? pick(answers, `collection:${node.path}`, cols.map((c) => c.name)) : cols[0].name;
      const fits = (name: string) => canBind(type as PartType, cols.find((c) => c.name === name)!);
      collection = fits(asked) ? asked : cols.find((c) => fits(c.name))?.name;
      if (!collection) throw new ComposeError(`no collection can show ${type}`);
    }
    t = setNode(t, node.path, collection ? { type, collection } : { type });
  }
  if (tree.root.type === null) {
    t = { ...t, accent: pick(answers, "accent", [...ACCENTS]) as Tree["accent"] };
    const ns = answers.find((x) => x.name === "nonsense");
    t = { ...t, nonsense: ns?.type === "predicate" ? ns.probability : 0 };
  }
  return t;
}

/** Slots that need a question (more than one option); single-option required slots are filled without asking. */
function slotPlan(state: AppState, node: TreeNode) {
  const col = state.data!.collections.find((c) => c.name === node.collection);
  if (!col) return [];
  return PART_INFO[node.type as PartType].slots.map((slot) => ({ slot, options: slotOptions(slot, col) }));
}

export function bindQuestions(state: AppState, tree: Tree): Question[] {
  const qs: Question[] = [];
  for (const node of partNodes(tree)) {
    for (const { slot, options } of slotPlan(state, node)) {
      if (options.length <= 1) continue;
      qs.push({
        type: "choice",
        name: `bind:${node.path}:${slot.name}`,
        instructions: `For the ${node.type} at ${placeText(tree, node.path)} (showing ${node.collection}): what should be its ${slot.question}?`,
        choices: options.map((o) => ({ value: o, description: o === "none" ? "Leave this empty" : o })),
      });
    }
  }
  return qs;
}

export function applyBind(state: AppState, tree: Tree, answers: DecisionAnswer[]): Tree {
  let t = tree;
  for (const node of partNodes(tree)) {
    const bindings: Bindings = {};
    for (const { slot, options } of slotPlan(state, node)) {
      const value = options.length === 1 ? options[0] : pick(answers, `bind:${node.path}:${slot.name}`, options);
      if (value !== "none") bindings[slot.name] = value;
    }
    t = setNode(t, node.path, { bindings });
  }
  return { ...t, bound: true };
}
```

Note: `setNode` with a patch that has no `type` keeps children as they are (parts have none), so applying bindings never reopens nodes.

- [ ] **Step 6: `compose/fallback.ts`**

```ts
import { PART_INFO, slotOptions } from "@/lib/kit/catalog";
import { emptyTree, setNode } from "@/lib/kit/tree";
import type { AppState, Bindings, PartType, Tree } from "@/lib/kit/types";

/** When the Decisions API can't answer: a sensible, complete tree built by rules. */
export function fallbackTree(state: AppState): Tree {
  const col = state.data?.collections[0];
  const hasChoice = !!col?.fields.some((f) => f.type === "choice");
  const [a, b]: PartType[] = hasChoice ? ["list", "detail"] : ["table", "form"];
  let t = setNode(emptyTree(), "root", { type: "split-h-2" });
  if (!col) {
    t = setNode(t, "root.0", { type: a });
    return setNode(t, "root.1", { type: b });
  }
  const bind = (part: PartType): Bindings => {
    const out: Bindings = {};
    for (const slot of PART_INFO[part].slots) {
      const first = slotOptions(slot, col).find((o) => o !== "none" && !Object.values(out).includes(o));
      if (first && (!slot.optional || Object.keys(out).length < 2)) out[slot.name] = first;
    }
    return out;
  };
  t = setNode(t, "root.0", { type: a, collection: col.name, bindings: bind(a) });
  t = setNode(t, "root.1", { type: b, collection: col.name, bindings: bind(b) });
  return { ...t, bound: true };
}
```

- [ ] **Step 7: Run tests** — `pnpm test src/lib/compose src/lib/kit` → PASS. Adjust `fallbackTree`'s optional-slot rule (not the test) if the expected bindings differ.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/decisions/types.ts web/src/lib/compose/describe.ts web/src/lib/compose/questions.ts web/src/lib/compose/fallback.ts web/src/lib/compose/questions.test.ts web/src/lib/compose/fallback.test.ts
git commit -m "Composer: Decisions questions per tree level and per binding slot, plus a rule-based fallback"
```

Note: `web/src/lib/compose/` already holds the old `compose.ts`, `shapes.ts`, `skeleton.ts`, `adapt.ts`; they stay until Task 10.

---

### Task 5: Gemini writes the app's data

**Files:**
- Create: `web/src/lib/content/data.ts`
- Modify: `web/src/lib/content/server.ts` (add `generateData`), `web/src/lib/content/prompt.ts` (add `buildDataPrompt`)
- Test: `web/src/lib/content/data.test.ts`

**Interfaces:**
- Consumes: Task 1 types; existing `gemini` call + `ContentError`.
- Produces: `DATA_RAW` (zod), `dataJsonSchema()`, `toData(raw): Data`, `buildDataPrompt(prompt): { system; user }`, `generateData(prompt, nonce, call?): Promise<Data>` (cached, one retry, like `generateContent`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { ContentError } from "./schema";
import { toData } from "./data";

const raw = {
  collections: [
    {
      name: "Trip Expenses",
      fields: [
        { name: "Item", type: "text", values: [] },
        { name: "Amount (¥)", type: "number", values: [] },
        { name: "category", type: "choice", values: ["food", "travel"] },
        { name: "paid", type: "yesno", values: [] },
      ],
      records: [["Ramen", "980", "food", "yes"], ["Train", "2,000", "lodging", "no"]],
    },
  ],
};

describe("toData", () => {
  test("names become snake_case, cells are typed, choice cells outside values fall back", () => {
    const d = toData(raw);
    const c = d.collections[0];
    expect(c.name).toBe("trip_expenses");
    expect(c.fields.map((f) => f.name)).toEqual(["item", "amount", "category", "paid"]);
    expect(c.records[0]).toMatchObject({ item: "Ramen", amount: 980, category: "food", paid: true });
    expect(c.records[1]).toMatchObject({ amount: 2000, category: "food", paid: false });
    expect(c.records[0].id).not.toBe(c.records[1].id);
  });

  test("limits: 4 collections, 8 fields, 15 records; choice fields need values", () => {
    expect(() => toData({ collections: Array(5).fill(raw.collections[0]) })).toThrow(ContentError);
    expect(() => toData({ collections: [{ ...raw.collections[0], records: Array(16).fill(raw.collections[0].records[0]) }] })).toThrow(ContentError);
    expect(() => toData({ collections: [{ ...raw.collections[0], fields: [{ name: "s", type: "choice", values: [] }], records: [] }] })).toThrow(ContentError);
  });

  test("duplicate names get a suffix", () => {
    const d = toData({ collections: [{ ...raw.collections[0], fields: [{ name: "a", type: "text", values: [] }, { name: "A", type: "text", values: [] }], records: [] }] });
    expect(d.collections[0].fields.map((f) => f.name)).toEqual(["a", "a_2"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `data.ts`**

```ts
import { z } from "zod";
import type { Collection, Data, Field, FieldType, Rec } from "@/lib/kit/types";
import { coerce } from "@/lib/kit/ops";
import { ContentError } from "./schema";

const s = (max: number) => z.string().min(1).max(max);
export const DATA_RAW = z.object({
  collections: z
    .array(
      z.object({
        name: s(40),
        fields: z.array(z.object({ name: s(30), type: z.enum(["text", "number", "date", "yesno", "choice"]), values: z.array(s(30)).max(8) })).min(1).max(8),
        records: z.array(z.array(z.string().max(120)).max(8)).max(15),
      }),
    )
    .min(1)
    .max(4),
});

export const dataJsonSchema = () => z.toJSONSchema(DATA_RAW, { target: "draft-7", unrepresentable: "any" });

const snake = (x: string) => x.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "field";
function unique(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    return k ? `${n}_${k + 1}` : n;
  });
}

let seq = 0;
export function toData(raw: unknown): Data {
  const p = DATA_RAW.safeParse(raw);
  if (!p.success) throw new ContentError(`data: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`);
  const colNames = unique(p.data.collections.map((c) => snake(c.name)));
  const collections: Collection[] = p.data.collections.map((c, ci) => {
    const names = unique(c.fields.map((f) => snake(f.name)));
    const fields: Field[] = c.fields.map((f, i) => {
      if (f.type === "choice" && f.values.length === 0) throw new ContentError(`data: choice field ${f.name} has no values`);
      return f.type === "choice" ? { name: names[i], type: f.type as FieldType, values: f.values } : { name: names[i], type: f.type as FieldType };
    });
    const records: Rec[] = c.records.map((cells) => {
      const rec: Rec = { id: `g${(seq++).toString(36)}` };
      fields.forEach((f, i) => (rec[f.name] = coerce(f, cells[i])));
      return rec;
    });
    return { name: colNames[ci], fields, records };
  });
  return { collections };
}
```

- [ ] **Step 4: `buildDataPrompt` in `prompt.ts`** (append; keep the existing exports until Task 10)

```ts
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
```

- [ ] **Step 5: `generateData` in `server.ts`** (append; reuse `gemini`, cache and retry pattern)

```ts
import { buildDataPrompt } from "./prompt";
import { dataJsonSchema, toData } from "./data";
import type { Data } from "@/lib/kit/types";

const dataCache = new Map<string, Data>();
const dataInflight = new Map<string, Promise<Data>>();

/** Gemini → validated Data. One retry on a bad answer. Cached per (prompt, nonce). */
export function generateData(prompt: string, nonce: number, call: GeminiCall = gemini): Promise<Data> {
  const key = `${prompt.trim().toLowerCase()}|${nonce}`;
  const hit = dataCache.get(key);
  if (hit) return Promise.resolve(hit);
  const running = dataInflight.get(key);
  if (running) return running;
  const once = async () => {
    const { system, user } = buildDataPrompt(prompt);
    const raw = await call({ system, user, schema: dataJsonSchema() });
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ContentError("not JSON");
    }
    return toData(json);
  };
  const p = (async () => {
    let d: Data;
    try {
      d = await once();
    } catch (e) {
      if (!(e instanceof ContentError)) throw e;
      d = await once();
    }
    if (dataCache.size >= 200) dataCache.delete(dataCache.keys().next().value!);
    dataCache.set(key, d);
    return d;
  })().finally(() => dataInflight.delete(key));
  dataInflight.set(key, p);
  return p;
}
```

- [ ] **Step 6: Run tests** — `pnpm test src/lib/content` → PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/content
git commit -m "Content: Gemini writes typed starting data (collections of records)"
```

---

### Task 6: Decisions client, composer step and API routes

**Files:**
- Create: `web/src/lib/decisions/client.ts` (move + generalise from `lib/intent/client.ts`)
- Create: `web/src/lib/compose/step.ts`, `web/src/app/api/compose/route.ts`
- Modify: `web/src/app/api/content/route.ts` (new body `{ prompt, nonce }` → `{ data }`)
- Test: `web/src/lib/decisions/client.test.ts`, `web/src/lib/compose/step.test.ts`, `web/src/app/api/compose/route.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `decide(input: string, questions: Question[], signal?: AbortSignal, f?: typeof fetch): Promise<DecisionAnswer[]>`, `decisionsMode(): "online" | "offline"`, `DECISIONS_MODEL()`.
  - `type Decide = (input: string, questions: Question[]) => Promise<DecisionAnswer[]>`
  - `composeStep(state: AppState, tree: Tree, prev: Tree | null, decide: Decide): Promise<{ tree: Tree; done: boolean }>` (one Decisions call per step; throws `ComposeError`/network errors)
  - `POST /api/compose` body `{ state: AppState; tree: Tree | null; prev: Tree | null }` → `200 { tree, done, ms, offline }` | `400 { error }`
  - `POST /api/content` body `{ prompt: string; nonce?: number }` → `200 { data }` | `400/429/502 { error }`

- [ ] **Step 1: Write the failing tests**

`decisions/client.test.ts`: port the existing `src/lib/intent/client.test.ts` cases to the generic API — `decisionsMode()` online only with `OPENAI_API_KEY`; `decide("text", [q])` posts to `https://api.openai.com/v1/decisions` with `Bearer` key, model `gpt-6-luna`, `input`, `questions`; returns `answers`; non-2xx throws `/401/`:
```ts
import { afterEach, expect, test, vi } from "vitest";
import { decide, decisionsMode } from "./client";

afterEach(() => vi.unstubAllEnvs());
const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };
const q = { type: "predicate" as const, name: "nonsense", instructions: "gibberish?" };

test("online only with a key", () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(decisionsMode()).toBe("offline");
  vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
  expect(decisionsMode()).toBe("online");
});

test("posts the questions and returns the answers", async () => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
  const f = ok({ answers: [{ type: "predicate", name: "nonsense", probability: 0.1 }] });
  const a = await decide("hello", [q], undefined, f);
  const [url, init] = f.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/decisions");
  expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-6-luna", input: "hello", questions: [q] });
  expect(a[0]).toMatchObject({ name: "nonsense", probability: 0.1 });
});

test("errors carry the status", async () => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-1234567890abcdef");
  await expect(decide("x", [q], undefined, ok({ error: { message: "bad" } }, 401))).rejects.toThrow(/401/);
});
```

`compose/step.test.ts`:
```ts
import { expect, test, vi } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { emptyTree } from "@/lib/kit/tree";
import type { DecisionAnswer, Question } from "@/lib/decisions/types";
import { composeStep, type Decide } from "./step";

const state = { prompt: "notes", ui: emptyUi(), history: [], data: { collections: [{ name: "notes", fields: [{ name: "body", type: "text" as const }], records: [] }] } };

/** Answers every question with its first option (and 0 for predicates). */
const firstOption: Decide = async (_input: string, qs: Question[]): Promise<DecisionAnswer[]> =>
  qs.map((q) => (q.type === "choice" ? { type: "choice", name: q.name, choice: q.choices.find((c) => !c.value.startsWith("split") && !c.value.startsWith("tabs") && c.value !== "grid-4")!.value, probabilities: [] } : { type: "predicate", name: q.name, probability: 0 }));

test("one Decisions call per step: level steps until complete, then one bind step", async () => {
  const decide = vi.fn(firstOption);
  let r = await composeStep(state, emptyTree(), null, decide);
  expect(decide).toHaveBeenCalledTimes(1);
  expect(r.tree.root.type).not.toBeNull();
  expect(r.done).toBe(false); // data exists → bind still to do
  r = await composeStep(state, r.tree, null, decide);
  expect(r.done).toBe(true);
  expect(r.tree.bound).toBe(true);
});

test("without data the tree is done once complete (no bind step)", async () => {
  const r = await composeStep({ ...state, data: null }, emptyTree(), null, firstOption);
  expect(r.done).toBe(true);
});

test("a bind step with no questions makes no call", async () => {
  const decide = vi.fn(firstOption);
  let r = await composeStep(state, emptyTree(), null, decide);
  r = await composeStep({ ...state, data: { collections: [{ name: "x", fields: [], records: [] }] } }, { ...r.tree, root: { path: "root", type: "picture" } }, null, decide);
  expect(r.done).toBe(true);
  expect(decide).toHaveBeenCalledTimes(1);
});
```

`app/api/compose/route.test.ts`:
```ts
import { expect, test, vi } from "vitest";

const decide = vi.fn();
vi.mock("@/lib/decisions/client", () => ({ decide: (...a: unknown[]) => decide(...a), decisionsMode: () => "online" }));
const { POST } = await import("./route");

const body = (b: unknown) => new Request("http://x/api/compose", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.7" }, body: JSON.stringify(b) });
const state = { prompt: "notes", ui: { selected: {}, filter: {}, sort: {}, tab: {} }, history: [], data: null };

test("a refusal falls back to the rule-based tree, marked offline", async () => {
  decide.mockResolvedValueOnce([{ type: "refusal", name: "node:root" }]);
  const r = await (await POST(body({ state, tree: null, prev: null }))).json();
  expect(r).toMatchObject({ done: true, offline: true });
  expect(r.tree.root.type).toBe("split-h-2");
});

test("oversized or malformed state is a 400", async () => {
  expect((await POST(body({ state: { ...state, prompt: "x".repeat(401) }, tree: null, prev: null }))).status).toBe(400);
  expect((await POST(body({ state: { ...state, history: Array(21).fill("h") }, tree: null, prev: null }))).status).toBe(400);
  expect((await POST(body({ nope: 1 }))).status).toBe(400);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: `decisions/client.ts`** — copy `src/lib/intent/client.ts`'s key handling, timeout (4000 ms), abort and error mapping; replace `classifyWithJev` with:

```ts
import "server-only";
import type { DecisionAnswer, Question } from "./types";

const DECISIONS_URL = "https://api.openai.com/v1/decisions";
const TIMEOUT_MS = 4000;
export const DECISIONS_MODEL = () => process.env.JEV_MODEL || "gpt-6-luna";

function looksLikeKey(key: string | undefined): key is string {
  const k = key?.trim() ?? "";
  return k.length >= 12 && !/\.\.\.|your|xxx|placeholder|changeme|<|>/i.test(k);
}
function apiKey(): string | null {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return null;
  const k = process.env.OPENAI_API_KEY;
  return looksLikeKey(k) ? k.trim() : null;
}
export const decisionsMode = (): "online" | "offline" => (apiKey() ? "online" : "offline");

/** One Decisions call: every question answered in parallel against the same input. */
export async function decide(input: string, questions: Question[], signal?: AbortSignal, f: typeof fetch = fetch): Promise<DecisionAnswer[]> {
  const key = apiKey();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await f(DECISIONS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: DECISIONS_MODEL(), input, questions }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = (await res.json().catch(() => ({}))) as { answers?: DecisionAnswer[]; error?: { message?: string } };
  if (!res.ok || !j.answers) throw new Error(`decisions ${res.status}: ${j.error?.message?.slice(0, 160) ?? "no answers"}`);
  return j.answers;
}
```

- [ ] **Step 4: `compose/step.ts`**

```ts
import { isComplete } from "@/lib/kit/tree";
import type { AppState, Tree } from "@/lib/kit/types";
import type { DecisionAnswer, Question } from "@/lib/decisions/types";
import { describe } from "./describe";
import { applyBind, applyLevel, bindQuestions, levelQuestions } from "./questions";

export type Decide = (input: string, questions: Question[]) => Promise<DecisionAnswer[]>;

/** One step = at most one Decisions call: the next tree level, or (when complete and data exists) the bindings. */
export async function composeStep(state: AppState, tree: Tree, prev: Tree | null, decide: Decide): Promise<{ tree: Tree; done: boolean }> {
  if (!isComplete(tree)) {
    const next = applyLevel(state, tree, await decide(describe(state, tree, prev), levelQuestions(state, tree)));
    return { tree: next, done: isComplete(next) && !state.data };
  }
  if (!state.data || tree.bound) return { tree, done: true };
  const qs = bindQuestions(state, tree);
  const answers = qs.length ? await decide(describe(state, tree, prev), qs) : [];
  return { tree: applyBind(state, tree, answers), done: true };
}
```

- [ ] **Step 5: `app/api/compose/route.ts`**

```ts
import { z } from "zod";
import { fallbackTree } from "@/lib/compose/fallback";
import { composeStep } from "@/lib/compose/step";
import { decide, decisionsMode } from "@/lib/decisions/client";
import { emptyTree } from "@/lib/kit/tree";
import { CONTAINERS, PARTS, type AppState, type Tree } from "@/lib/kit/types";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const value = z.union([z.string().max(200), z.number(), z.boolean()]);
const field = z.object({ name: z.string().max(30), type: z.enum(["text", "number", "date", "yesno", "choice"]), values: z.array(z.string().max(30)).max(8).optional() });
const collection = z.object({ name: z.string().max(40), fields: z.array(field).max(8), records: z.array(z.record(z.string(), value)).max(200) });
const node: z.ZodType = z.lazy(() =>
  z.object({ path: z.string().max(24), type: z.enum([...CONTAINERS, ...PARTS] as [string, ...string[]]).nullable(), collection: z.string().max(40).optional(), bindings: z.record(z.string(), z.string().max(40)).optional(), children: z.array(node).max(4).optional() }),
);
const tree = z.object({ root: node, accent: z.string().max(12), nonsense: z.number(), bound: z.boolean() });
const body = z.object({
  state: z.object({
    prompt: z.string().trim().min(1).max(400),
    data: z.object({ collections: z.array(collection).max(4) }).nullable(),
    ui: z.object({ selected: z.record(z.string(), z.string().nullable()), filter: z.record(z.string(), z.string().max(200)), sort: z.record(z.string(), z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) })), tab: z.record(z.string(), z.number()) }),
    history: z.array(z.string().max(200)).max(20),
  }),
  tree: tree.nullable(),
  prev: tree.nullable(),
});

/** One composer step (one Decisions call). The client calls this repeatedly to render each level as it lands. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { state, tree, prev }" }, { status: 400 });
  const state = parsed.data.state as AppState;
  const started = performance.now();
  const offline = () => Response.json({ tree: fallbackTree(state), done: true, offline: true, ms: Math.round(performance.now() - started) });
  if (decisionsMode() === "offline" || !rateLimit(`compose:${clientKey(request)}`, 120, 60_000).ok) return offline();
  try {
    const r = await composeStep(state, (parsed.data.tree as Tree | null) ?? emptyTree(), parsed.data.prev as Tree | null, (input, qs) => decide(input, qs, request.signal));
    return Response.json({ ...r, offline: false, ms: Math.round(performance.now() - started) });
  } catch (e) {
    console.warn(`[compose] ${(e as Error).message}`);
    return offline();
  }
}
```

- [ ] **Step 6: `/api/content` returns data** — replace the body schema and handler in `web/src/app/api/content/route.ts`:

```ts
const body = z.object({ prompt: z.string().trim().min(2).max(400), nonce: z.number().int().min(0).max(1_000_000).default(0) });
// …
try {
  return Response.json({ data: await generateData(parsed.data.prompt, parsed.data.nonce) });
} catch (e) {
  console.warn(`[content] data: ${(e as Error).message}`);
  return Response.json({ error: "Couldn't write this one." }, { status: 502 });
}
```
Keep the existing rate limit lines. Remove now-unused imports (`SHAPE_KEYS`, `SHELL_KEYS`, `VIBES`, `generateContent`).

- [ ] **Step 7: Run tests** — `pnpm test` → PASS (old intent/content tests still pass; they're removed in Task 10). `pnpm exec tsc --noEmit` → the old `src/lib/content/client.ts`/`AppFrame` still call `/api/content` with the old body; that's expected to fail at runtime only, not typecheck.

- [ ] **Step 8: Live check (dev server on :3001)**

```bash
curl -s -X POST localhost:3001/api/content -H 'content-type: application/json' -d '{"prompt":"expense tracker for my tokyo trip"}' | head -c 400
```
Expected: `{"data":{"collections":[{"name":…`. Then:
```bash
S='{"prompt":"expense tracker for my tokyo trip","data":null,"ui":{"selected":{},"filter":{},"sort":{},"tab":{}},"history":[]}'
curl -s -X POST localhost:3001/api/compose -H 'content-type: application/json' -d "{\"state\":$S,\"tree\":null,\"prev\":null}" | head -c 400
```
Expected: `{"tree":{"root":{"path":"root","type":…},"done":false,"offline":false,"ms":…}` (a container) or `done:true` (a single part).

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/decisions web/src/lib/compose/step.ts web/src/lib/compose/step.test.ts web/src/app/api/compose web/src/app/api/content/route.ts
git commit -m "Composer API: one Decisions call per step; content API returns typed data"
```

---

### Task 7: Client compose loop

**Files:**
- Create: `web/src/lib/compose/client.ts`
- Test: `web/src/lib/compose/client.test.ts`

**Interfaces:**
- Consumes: `/api/compose` (Task 6), `/api/content`.
- Produces:
  - `type StepResult = { tree: Tree; done: boolean; offline: boolean; ms: number }`
  - `type Step = (state: AppState, tree: Tree | null, prev: Tree | null) => Promise<StepResult>`
  - `fetchStep: Step` (POST `/api/compose`)
  - `runCompose(state, prev, onTree: (t: Tree) => void, opts?: { step?: Step; isCurrent?: () => boolean; maxSteps?: number }): Promise<{ tree: Tree; calls: number; ms: number; offline: boolean } | null>` — returns `null` when superseded.
  - `fetchData(prompt: string, nonce: number, f?: typeof fetch): Promise<Data>` (plain-sentence errors: 429 → "Too many apps at once. Wait a few seconds and try again.", 400 → "That prompt can't be turned into an app.", network/timeout → "Gemini took too long. Try again.", else "Couldn't write this one.")

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test, vi } from "vitest";
import { emptyUi } from "@/lib/kit/ops";
import { setNode, emptyTree } from "@/lib/kit/tree";
import { fetchData, runCompose, type Step } from "./client";

const state = { prompt: "notes", data: null, ui: emptyUi(), history: [] };
const t1 = setNode(emptyTree(), "root", { type: "split-h-2" });
const t2 = setNode(setNode(t1, "root.0", { type: "list" }), "root.1", { type: "detail" });

test("renders every step's tree and stops when done", async () => {
  const step: Step = vi.fn().mockResolvedValueOnce({ tree: t1, done: false, offline: false, ms: 300 }).mockResolvedValueOnce({ tree: t2, done: true, offline: false, ms: 310 });
  const seen: string[] = [];
  const r = await runCompose(state, null, (t) => seen.push(t.root.type!), { step });
  expect(seen).toEqual(["split-h-2", "split-h-2"]);
  expect(r).toMatchObject({ calls: 2, ms: 610, offline: false });
});

test("a superseded compose renders nothing more and returns null", async () => {
  let current = true;
  const step: Step = vi.fn(async () => {
    current = false;
    return { tree: t1, done: false, offline: false, ms: 1 };
  });
  const onTree = vi.fn();
  expect(await runCompose(state, null, onTree, { step, isCurrent: () => current })).toBeNull();
  expect(onTree).not.toHaveBeenCalled();
});

test("maxSteps bounds a runaway loop", async () => {
  const step: Step = vi.fn(async () => ({ tree: t1, done: false, offline: false, ms: 1 }));
  await runCompose(state, null, () => {}, { step, maxSteps: 3 });
  expect(step).toHaveBeenCalledTimes(3);
});

test("fetchData maps failures to plain sentences", async () => {
  const res = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch;
  await expect(fetchData("x", 1, res(429))).rejects.toThrow("Too many apps at once. Wait a few seconds and try again.");
  await expect(fetchData("x", 2, res(502))).rejects.toThrow("Couldn't write this one.");
  const boom = vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
  await expect(fetchData("x", 3, boom)).rejects.toThrow("Gemini took too long. Try again.");
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `compose/client.ts`**

```ts
import type { AppState, Data, Tree } from "@/lib/kit/types";

export type StepResult = { tree: Tree; done: boolean; offline: boolean; ms: number };
export type Step = (state: AppState, tree: Tree | null, prev: Tree | null) => Promise<StepResult>;

export const fetchStep: Step = async (state, tree, prev) => {
  const res = await fetch("/api/compose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state, tree, prev }), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`compose ${res.status}`);
  return (await res.json()) as StepResult;
};

/** Compose a whole tree, one Decisions call per step, rendering each step as it lands. */
export async function runCompose(
  state: AppState,
  prev: Tree | null,
  onTree: (t: Tree) => void,
  opts: { step?: Step; isCurrent?: () => boolean; maxSteps?: number } = {},
): Promise<{ tree: Tree; calls: number; ms: number; offline: boolean } | null> {
  const step = opts.step ?? fetchStep;
  const isCurrent = opts.isCurrent ?? (() => true);
  let tree: Tree | null = null;
  let calls = 0, ms = 0, offline = false;
  for (let i = 0; i < (opts.maxSteps ?? 6); i++) {
    const r = await step(state, tree, prev);
    if (!isCurrent()) return null;
    calls += r.offline ? 0 : 1;
    ms += r.ms;
    offline ||= r.offline;
    tree = r.tree;
    onTree(tree);
    if (r.done) break;
  }
  return tree ? { tree, calls, ms, offline } : null;
}

const dataCache = new Map<string, Promise<Data>>();
export function fetchData(prompt: string, nonce: number, f: typeof fetch = fetch): Promise<Data> {
  const key = `${prompt.trim().toLowerCase()}|${nonce}`;
  const hit = dataCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    let res: Response;
    try {
      res = await f("/api/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, nonce }), signal: AbortSignal.timeout(25_000) });
    } catch {
      throw new Error("Gemini took too long. Try again.");
    }
    const j = (await res.json().catch(() => ({}))) as { data?: Data };
    if (res.ok && j.data) return j.data;
    if (res.status === 429) throw new Error("Too many apps at once. Wait a few seconds and try again.");
    if (res.status === 400) throw new Error("That prompt can't be turned into an app.");
    throw new Error("Couldn't write this one.");
  })();
  dataCache.set(key, p);
  p.catch(() => dataCache.delete(key));
  return p;
}
```

- [ ] **Step 4: Run tests** — `pnpm test src/lib/compose` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/compose/client.ts web/src/lib/compose/client.test.ts
git commit -m "Composer client: render each Decisions step as it lands; drop stale composes"
```

---

### Task 8: Render the tree (kit components)

**Files:**
- Create: `web/src/kit/Render.tsx`, `web/src/kit/parts/data.tsx`, `web/src/kit/parts/input.tsx`, `web/src/kit/parts/visual.tsx`, `web/src/kit/kit.css`
- Modify: `web/src/app/globals.css` (import `kit.css` — or import it from `Render.tsx`)

**Interfaces:**
- Consumes: Tasks 1–3 (`Tree`, `TreeNode`, `AppState`, `Op`, `visibleRecords`, `aggregate`, `recordLabel`, `nodeKey`, `isContainer`), `Widgets` (`BarChart`, `LineChart`, `GroupBox`, `fmt`), `/api/image`.
- Produces:
  - `type PartProps = { node: TreeNode; col: Collection | null; state: AppState; dispatch: (op: Op) => void; preview: boolean }`
  - `RenderTree({ tree, state, dispatch, preview }: { tree: Tree; state: AppState; dispatch: (op: Op) => void; preview: boolean })`
  - `ACCENT_CSS: Record<Accent, string>`

- [ ] **Step 1: `kit.css`** (Win98 look, uses existing tokens)

```css
.kit { display: flex; flex: 1; min-height: 0; gap: 4px; }
.kit-h { flex-direction: row; } .kit-v { flex-direction: column; }
.kit-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 4px; flex: 1; min-height: 0; }
.kit-pane { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.kit-part { display: flex; flex-direction: column; flex: 1; min-height: 0; padding: 6px; gap: 6px; background: #fff; overflow: auto; }
.kit-title { font-weight: 800; font-size: 12px; color: var(--accent, #0a2a8a); text-transform: capitalize; }
.kit-open, .kit-placeholder { flex: 1; display: grid; place-items: center; color: #777; font-size: 12px; background: repeating-linear-gradient(45deg, #f4f4f4 0 8px, #ececec 8px 16px); }
.kit-empty { color: #888; font-size: 12px; padding: 12px; text-align: center; }
.kit-enter { animation: kit-in .28s ease-out; } @keyframes kit-in { from { opacity: 0; transform: scale(.98); } to { opacity: 1; transform: none; } }
.kit-stat { flex: 1; padding: 8px; } .kit-stat b { display: block; font-size: 22px; color: var(--accent, #0a2a8a); }
.kit-card { padding: 4px 6px; margin-bottom: 4px; cursor: grab; }
```

- [ ] **Step 2: `Render.tsx`**

```tsx
"use client";

import "./kit.css";
import { isContainer } from "@/lib/kit/catalog";
import type { Op } from "@/lib/kit/ops";
import { nodeKey } from "@/lib/kit/tree";
import type { Accent, AppState, PartType, Tree, TreeNode } from "@/lib/kit/types";
import { DetailPart, ListPart, StatRowPart, TablePart } from "./parts/data";
import { ButtonBarPart, ChecklistPart, FormPart, SearchPart } from "./parts/input";
import { BarChartPart, CalendarPart, KanbanPart, LineChartPart, NotePart, PicturePart } from "./parts/visual";
import type { PartProps } from "./parts/types";
import { useState } from "react";

export const ACCENT_CSS: Record<Accent, string> = { navy: "#0a2a8a", teal: "#0f7c7c", green: "#1f7a2e", purple: "#5b2fa6", maroon: "#8a1d2a", olive: "#5f6b12" };

const PARTS: Record<PartType, (p: PartProps) => React.ReactNode> = {
  table: TablePart, list: ListPart, detail: DetailPart, "stat-row": StatRowPart,
  form: FormPart, search: SearchPart, "button-bar": ButtonBarPart, checklist: ChecklistPart,
  "bar-chart": BarChartPart, "line-chart": LineChartPart, kanban: KanbanPart, calendar: CalendarPart, note: NotePart, picture: PicturePart,
};

function Node({ node, state, dispatch, preview }: { node: TreeNode; state: AppState; dispatch: (op: Op) => void; preview: boolean }) {
  const [tab, setTab] = useState(0);
  if (node.type === null) return <div className="kit-open sunken">Jev is deciding…</div>;
  if (isContainer(node.type)) {
    const kids = node.children ?? [];
    const child = (c: TreeNode) => (
      <div className="kit-pane" key={nodeKey(c)}>
        <Node node={c} state={state} dispatch={dispatch} preview={preview} />
      </div>
    );
    if (node.type.startsWith("tabs")) {
      return (
        <div className="kit-pane">
          <div className="tabs">
            {kids.map((c, i) => (
              <button key={c.path} className={`tab ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>
                {c.type && !isContainer(c.type) ? `${c.collection ?? c.type}` : `View ${i + 1}`}
              </button>
            ))}
          </div>
          <div className="tab-panel kit-pane">{kids[tab] && child(kids[tab])}</div>
        </div>
      );
    }
    if (node.type === "grid-4") return <div className="kit-grid">{kids.map(child)}</div>;
    return <div className={`kit ${node.type.startsWith("split-h") ? "kit-h" : "kit-v"}`}>{kids.map(child)}</div>;
  }
  const col = state.data?.collections.find((c) => c.name === node.collection) ?? null;
  const Part = PARTS[node.type];
  if (!col && node.type !== "picture") return <div className="kit-placeholder sunken">{node.type}{node.collection ? ` of ${node.collection}` : ""}…</div>;
  return (
    <div className="kit-part sunken kit-enter">
      <Part node={node} col={col} state={state} dispatch={dispatch} preview={preview} />
    </div>
  );
}

/** The composed app: containers nest, parts render their collection. Stable keys keep unchanged parts mounted. */
export function RenderTree({ tree, state, dispatch, preview }: { tree: Tree; state: AppState; dispatch: (op: Op) => void; preview: boolean }) {
  return (
    <div className="kit-pane" style={{ ["--accent" as string]: ACCENT_CSS[tree.accent] }} key={nodeKey(tree.root)}>
      <Node node={tree.root} state={state} dispatch={dispatch} preview={preview} />
    </div>
  );
}
```

- [ ] **Step 3: `parts/types.ts`**

```ts
import type { Op } from "@/lib/kit/ops";
import type { AppState, Collection, TreeNode } from "@/lib/kit/types";
export type PartProps = { node: TreeNode; col: Collection | null; state: AppState; dispatch: (op: Op) => void; preview: boolean };
```

- [ ] **Step 4: `parts/data.tsx`** — table, list, detail, stat-row

```tsx
"use client";

import { fmt } from "@/components/win99/Widgets";
import { aggregate, recordLabel, visibleRecords } from "@/lib/kit/ops";
import type { Collection, Rec } from "@/lib/kit/types";
import type { PartProps } from "./types";

const cell = (col: Collection, rec: Rec, field: string) => {
  const f = col.fields.find((x) => x.name === field);
  const v = rec[field];
  if (f?.type === "number") return fmt(Number(v), "num");
  if (f?.type === "yesno") return v ? "✓" : "";
  return String(v ?? "");
};
const Empty = ({ col }: { col: Collection }) => <div className="kit-empty">No {col.name} yet.</div>;

export function TablePart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const cols = ["col1", "col2", "col3", "col4"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  const rows = visibleRecords(c, state.ui);
  const sel = state.ui.selected[c.name];
  return (
    <>
      <div className="kit-title">{c.name}</div>
      {rows.length === 0 ? <Empty col={c} /> : (
        <div className="listview sunken grow">
          <table>
            <thead><tr>{cols.map((f) => <th key={f} onClick={() => !preview && dispatch({ kind: "sort", collection: c.name, field: f })} style={{ cursor: "pointer" }}>{f}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={sel === r.id ? "sel" : ""} onClick={() => !preview && dispatch({ kind: "select", collection: c.name, id: r.id })}>
                  {cols.map((f) => <td key={f} className={c.fields.find((x) => x.name === f)?.type === "number" ? "num" : ""}>{cell(c, r, f)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ListPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const rows = visibleRecords(c, state.ui);
  const sel = state.ui.selected[c.name];
  const sub = node.bindings?.subtitle;
  return (
    <>
      <div className="kit-title">{c.name}</div>
      {rows.length === 0 ? <Empty col={c} /> : rows.map((r) => (
        <button key={r.id} className={`menu-item ${sel === r.id ? "hot" : ""}`} style={{ padding: "4px 6px", flexDirection: "column", alignItems: "flex-start" }} onClick={() => !preview && dispatch({ kind: "select", collection: c.name, id: r.id })}>
          <b>{cell(c, r, node.bindings?.title ?? "")}</b>
          {sub && <span style={{ fontSize: 11, opacity: 0.8 }}>{cell(c, r, sub)}</span>}
        </button>
      ))}
    </>
  );
}

export function DetailPart({ col, state }: PartProps) {
  const c = col!;
  const rec = c.records.find((r) => r.id === state.ui.selected[c.name]);
  if (!rec) return <div className="kit-empty">Select a {c.name.replace(/s$/, "")} to see it here.</div>;
  return (
    <>
      <div className="kit-title">{recordLabel(c, rec)}</div>
      {c.fields.map((f) => (
        <div key={f.name} className="row" style={{ justifyContent: "space-between", fontSize: 12, borderBottom: "1px dotted #ccc", padding: "3px 0" }}>
          <span className="muted">{f.name}</span><b>{cell(c, rec, f.name)}</b>
        </div>
      ))}
    </>
  );
}

const aggLabel = (a: string) => (a === "count" ? "count" : a.replace(":", " of "));
export function StatRowPart({ node, col, state }: PartProps) {
  const c = col!;
  const aggs = ["agg1", "agg2", "agg3"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  return (
    <div className="row" style={{ alignItems: "stretch" }}>
      {aggs.map((a) => (
        <div key={a} className="kit-stat raised"><span className="muted" style={{ fontSize: 11 }}>{aggLabel(a)}</span><b>{fmt(aggregate(c, state.ui, a), "num")}</b></div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `parts/input.tsx`** — form, search, button-bar, checklist

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { visibleRecords } from "@/lib/kit/ops";
import type { PartProps } from "./types";

export function FormPart({ node, col, dispatch, preview }: PartProps) {
  const c = col!;
  const fields = ["field1", "field2", "field3", "field4"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  const [vals, setVals] = useState<Record<string, string>>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (preview || !Object.values(vals).some((v) => v.trim())) return;
    dispatch({ kind: "add", collection: c.name, values: vals });
    setVals({});
  };
  return (
    <form onSubmit={submit} className="col" style={{ gap: 6 }}>
      <div className="kit-title">Add to {c.name}</div>
      {fields.map((name) => {
        const f = c.fields.find((x) => x.name === name)!;
        const set = (v: string) => setVals((s) => ({ ...s, [name]: v }));
        return (
          <label key={name} className="row" style={{ gap: 6 }}>
            <span style={{ width: 80, fontSize: 12 }}>{name}</span>
            {f.type === "choice" ? (
              <select className="field grow" value={vals[name] ?? f.values![0]} onChange={(e) => set(e.target.value)}>{f.values!.map((v) => <option key={v}>{v}</option>)}</select>
            ) : f.type === "yesno" ? (
              <input type="checkbox" checked={/^(yes|true)$/.test(vals[name] ?? "")} onChange={(e) => set(e.target.checked ? "yes" : "no")} />
            ) : (
              <input className="field grow" type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={vals[name] ?? ""} onChange={(e) => set(e.target.value)} />
            )}
          </label>
        );
      })}
      <button className="btn primary" type="submit" disabled={preview}>Add</button>
    </form>
  );
}

export function SearchPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const field = node.bindings?.field ?? "";
  const [q, setQ] = useState(state.ui.filter[c.name] ?? "");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (preview) return;
    const t = setTimeout(() => dispatch({ kind: "filter", collection: c.name, query: q, field }), 500);
    return () => clearTimeout(t);
    // dispatch identity changes per render; the query is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="row" style={{ gap: 6 }}>
      <input className="field grow" placeholder={`Search ${c.name} by ${field}…`} value={q} onChange={(e) => setQ(e.target.value)} disabled={preview} />
      <span className="muted" style={{ fontSize: 11 }}>{visibleRecords(c, state.ui).length} shown</span>
    </div>
  );
}

const BTN_LABEL = (b: string) => (b === "remove-selected" ? "Remove selected" : b === "clear-selection" ? "Clear selection" : b === "clear-filter" ? "Show all" : `Sort by ${b.slice(5)}`);
export function ButtonBarPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const btns = ["btn1", "btn2", "btn3"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  const run = (b: string) => {
    const sel = state.ui.selected[c.name];
    if (b === "remove-selected") return sel && dispatch({ kind: "remove", collection: c.name, id: sel });
    if (b === "clear-selection") return dispatch({ kind: "clear", collection: c.name, what: "selection" });
    if (b === "clear-filter") return dispatch({ kind: "clear", collection: c.name, what: "filter" });
    dispatch({ kind: "sort", collection: c.name, field: b.slice(5) });
  };
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {btns.map((b) => <button key={b} className="btn" disabled={preview || (b === "remove-selected" && !state.ui.selected[c.name])} onClick={() => run(b)}>{BTN_LABEL(b)}</button>)}
    </div>
  );
}

export function ChecklistPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const title = node.bindings?.title ?? "", done = node.bindings?.done ?? "";
  const rows = visibleRecords(c, state.ui);
  return (
    <>
      <div className="kit-title">{c.name}</div>
      {rows.length === 0 ? <div className="kit-empty">Nothing here yet.</div> : rows.map((r) => (
        <label key={r.id} className="check" style={{ textDecoration: r[done] ? "line-through" : "none" }}>
          <input type="checkbox" checked={!!r[done]} disabled={preview} onChange={() => dispatch({ kind: "update", collection: c.name, id: r.id, field: done, value: !r[done] })} /> {String(r[title])}
        </label>
      ))}
    </>
  );
}
```

- [ ] **Step 6: `parts/visual.tsx`** — bar-chart, line-chart, kanban, calendar, note, picture

```tsx
"use client";

import { useState } from "react";
import { BarChart, LineChart } from "@/components/win99/Widgets";
import { visibleRecords } from "@/lib/kit/ops";
import type { PartProps } from "./types";

export function BarChartPart({ node, col, state }: PartProps) {
  const c = col!;
  const rows = visibleRecords(c, state.ui).slice(0, 12);
  const label = node.bindings?.label ?? "", value = node.bindings?.value ?? "";
  if (!rows.length) return <div className="kit-empty">No {c.name} to chart.</div>;
  return (<><div className="kit-title">{value} by {label}</div><BarChart values={rows.map((r) => Number(r[value]) || 0)} labels={rows.map((r) => String(r[label]).slice(0, 8))} /></>);
}

export function LineChartPart({ node, col, state }: PartProps) {
  const c = col!;
  const value = node.bindings?.value ?? "", order = node.bindings?.order;
  let rows = visibleRecords(c, state.ui);
  if (order) rows = [...rows].sort((a, b) => String(a[order]).localeCompare(String(b[order])));
  const pts = rows.map((r) => Number(r[value]) || 0);
  if (pts.length < 2) return <div className="kit-empty">Add more {c.name} to see a trend.</div>;
  return (<><div className="kit-title">{value} over {order ?? "time"}</div><LineChart points={pts} height={110} color="var(--accent)" /></>);
}

export function KanbanPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const colField = node.bindings?.column ?? "", title = node.bindings?.title ?? "";
  const lanes = c.fields.find((f) => f.name === colField)?.values ?? [];
  const rows = visibleRecords(c, state.ui);
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <div className="row" style={{ alignItems: "stretch", gap: 6, flex: 1 }}>
      {lanes.map((lane) => (
        <div key={lane} className="col sunken" style={{ flex: 1, padding: 4, background: "#f4f4f4" }} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && !preview && dispatch({ kind: "update", collection: c.name, id: drag, field: colField, value: lane })}>
          <div className="kit-title">{lane}</div>
          {rows.filter((r) => r[colField] === lane).map((r) => (
            <div key={r.id} className="kit-card raised" draggable={!preview} onDragStart={() => setDrag(r.id)}>{String(r[title])}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CalendarPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const dateF = node.bindings?.date ?? "", title = node.bindings?.title ?? "";
  const rows = visibleRecords(c, state.ui);
  const first = rows.map((r) => String(r[dateF])).filter((d) => /^\d{4}-\d{2}/.test(d)).sort()[0] ?? new Date().toISOString().slice(0, 10);
  const [y, m] = first.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  return (
    <>
      <div className="kit-title">{new Date(y, m - 1).toLocaleString("en", { month: "long", year: "numeric" })}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, fontSize: 11 }}>
        {Array.from({ length: lead }, (_, i) => <div key={`l${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${ym}-${String(i + 1).padStart(2, "0")}`;
          const items = rows.filter((r) => String(r[dateF]).startsWith(d));
          return (
            <button key={d} className="btn" style={{ minWidth: 0, height: 34, padding: 1, flexDirection: "column", fontSize: 10, background: items.length ? "#e8f0ff" : undefined }} title={items.map((r) => String(r[title])).join(", ")} onClick={() => !preview && dispatch({ kind: "filter", collection: c.name, query: d, field: dateF })}>
              {i + 1}{items.length ? ` •${items.length}` : ""}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function NotePart({ node, col }: PartProps) {
  const c = col!;
  const text = node.bindings?.text ?? "";
  const body = c.records.map((r) => String(r[text] ?? "")).filter(Boolean).join("\n\n");
  return <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 13 }}>{body || "Nothing written yet."}</div>;
}

export function PicturePart({ state, preview }: PartProps) {
  if (preview) return <div className="kit-empty">🖼️ a picture of {state.prompt}</div>;
  // eslint-disable-next-line @next/next/no-img-element -- generated by our own /api/image
  return <img alt={state.prompt} src={`/api/image?${new URLSearchParams({ q: state.prompt, style: "default" })}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}
```

- [ ] **Step 7: Typecheck and lint** — `pnpm exec tsc --noEmit && pnpm lint` → clean for the new files (old code untouched).

- [ ] **Step 8: Commit**

```bash
git add web/src/kit
git commit -m "Kit components: containers and 14 parts in the Win98 look"
```

---

### Task 9: App window, Start preview, Task Manager — switch the OS to composed apps

**Files:**
- Create: `web/src/apps/AppWindow.tsx`, `web/src/apps/useComposed.ts`
- Modify: `web/src/os/store.ts` (payload, stats), `web/src/os/OS.tsx`, `web/src/os/StartMenu.tsx`, `web/src/system/SystemApps.tsx` (Task Manager)

**Interfaces:**
- Consumes: Tasks 2, 7, 8.
- Produces:
  - store: `type AppSpec = { id: string; title: string; prompt: string; tree: Tree | null }`; `WinPayload` `{ type: "app"; app: AppSpec }`; `openApp(app: AppSpec)`; `OSState.stats: Record<string, { calls: number; ms: number; offline: boolean }>`; `setStats(winId, s)`.
  - `useComposed(state: AppState, seed: Tree | null, opts: { enabled: boolean; delayMs: number }): { tree: Tree | null; composing: boolean; calls: number; ms: number; offline: boolean }`
  - `AppWindow({ app, winId })`

- [ ] **Step 1: `useComposed.ts`**

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { runCompose } from "@/lib/compose/client";
import type { AppState, Tree } from "@/lib/kit/types";

/** Re-compose whenever `state` changes (after `delayMs`), rendering each level; older composes are dropped. */
export function useComposed(state: AppState, seed: Tree | null, opts: { enabled: boolean; delayMs: number }) {
  const [tree, setTree] = useState<Tree | null>(seed);
  const [info, setInfo] = useState({ composing: false, calls: 0, ms: 0, offline: false });
  const gen = useRef(0);
  const last = useRef<Tree | null>(seed);
  const key = JSON.stringify(state);
  useEffect(() => {
    if (!opts.enabled || !state.prompt.trim()) return;
    const my = ++gen.current;
    const t = setTimeout(async () => {
      setInfo((i) => ({ ...i, composing: true }));
      const r = await runCompose(state, last.current, (tr) => my === gen.current && setTree(tr), { isCurrent: () => my === gen.current }).catch(() => null);
      if (!r || my !== gen.current) return;
      last.current = r.tree;
      setInfo({ composing: false, calls: r.calls, ms: r.ms, offline: r.offline });
    }, opts.delayMs);
    return () => clearTimeout(t);
    // `key` is the state's identity; `state` itself is a new object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.enabled, opts.delayMs]);
  return { tree, ...info };
}
```

- [ ] **Step 2: `AppWindow.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { MenuBar, type MenuEntry } from "@/components/win99/Menu";
import { RenderTree } from "@/kit/Render";
import { fetchData } from "@/lib/compose/client";
import { applyOp, emptyUi, type Op } from "@/lib/kit/ops";
import { treeText } from "@/lib/kit/tree";
import type { AppState } from "@/lib/kit/types";
import { type AppSpec, closeWindow, message, setStats } from "@/os/store";
import { useComposed } from "./useComposed";

/** A composed app: state → Jev composes the tree → interactions change state → Jev re-composes. */
export function AppWindow({ app, winId }: { app: AppSpec; winId: string }) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<AppState>({ prompt: app.prompt, data: null, ui: emptyUi(), history: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    fetchData(app.prompt, nonce)
      .then((data) => live && setState({ prompt: app.prompt, data, ui: emptyUi(), history: [] }))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [app.prompt, nonce]);

  // Compose only once data exists (the Start preview already gave us a layout to show meanwhile).
  const c = useComposed(state, app.tree, { enabled: !!state.data, delayMs: 0 });
  useEffect(() => setStats(winId, { calls: c.calls, ms: c.ms, offline: c.offline }), [winId, c.calls, c.ms, c.offline]);
  const dispatch = useMemo(() => (op: Op) => setState((s) => applyOp(s, op)), []);

  const file: MenuEntry[] = [
    { label: "New data", icon: "document", onClick: () => setNonce((n) => n + 1) },
    "sep",
    { label: "Close", onClick: () => closeWindow(winId) },
  ];
  const help: MenuEntry[] = [{ label: "How was this made?", icon: "info", onClick: () => message(app.title, "info", `Jev composed this window in ${c.calls} Decisions calls (${c.ms} ms)${c.offline ? " — offline fallback" : ""}. Gemini wrote the data.`, c.tree ? treeText(c.tree) : "") }];

  return (
    <>
      <MenuBar menus={[{ label: "File", items: file }, { label: "Help", items: help }]} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", padding: 3, minHeight: 0 }}>
        {error ? (
          <div className="sunken" style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, background: "#fff" }}>
            <Icon name="error" size={32} />
            <b className="grow">{error}</b>
            <button className="btn" onClick={() => setNonce((n) => n + 1)}>Try again</button>
          </div>
        ) : c.tree ? (
          <RenderTree tree={c.tree} state={state} dispatch={dispatch} preview={false} />
        ) : (
          <div className="kit-open sunken">Jev is designing this app…</div>
        )}
      </div>
      <div className="statusbar">
        <div>{c.composing ? "Jev is composing…" : c.offline ? "Composed offline" : `Composed by Jev · ${c.calls} calls · ${c.ms} ms`}</div>
        <div>{state.data ? `${state.data.collections.map((x) => `${x.records.length} ${x.name}`).join(" · ")}` : "Gemini is writing the data…"}</div>
        <div>{state.history.at(-1) ?? "Ready"}</div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Store changes** (`web/src/os/store.ts`)

Replace the `AppManifest` import and app payload:
```ts
import type { Tree } from "@/lib/kit/types";
export type AppSpec = { id: string; title: string; prompt: string; tree: Tree | null };
// WinPayload: | { type: "app"; app: AppSpec }
// OSState: add  stats: Record<string, { calls: number; ms: number; offline: boolean }>  (initial {})
export function setStats(winId: string, s: { calls: number; ms: number; offline: boolean }) {
  set((st) => ({ stats: { ...st.stats, [winId]: s } }));
}
export function openApp(app: AppSpec) {
  return openWindow({ title: app.title, icon: "logo", payload: { type: "app", app }, w: 820, h: 560, single: `app:${app.id}` });
}
```
`newId` moves into store (copy the existing helper from `lib/compose/compose.ts`): `let seq = 0; export const newId = (p = "app") => \`${p}_${Date.now().toString(36)}_${(seq++).toString(36)}\`;`. `closeWindow` also deletes `stats[id]`.

- [ ] **Step 4: `OS.tsx`** — import `AppWindow` from `@/apps/AppWindow` instead of `@/shells/AppFrame`.

- [ ] **Step 5: `StartMenu.tsx`** — replace intent/combos with a composed preview:

- Remove imports of `draftManifest`, `topCombos`, `SHELL_META`, `paramChips`, `parse`, `topK`, `ShellView`, `useIntent`.
- State for preview: `const previewState = useMemo<AppState>(() => ({ prompt: q.trim().slice(0, MAX_PROMPT), data: null, ui: emptyUi(), history: [] }), [q]);` and `const c = useComposed(previewState, null, { enabled: q.trim().length >= 3, delayMs: 300 });` (define `const MAX_PROMPT = 400;` locally).
- Entries when `q` is non-empty: system/action hits as today, then — once `c.tree` exists and `c.tree.nonsense <= 0.6` — one entry `{ kind: "create", title }` where `title = q.trim().replace(/^./, (x) => x.toUpperCase()).slice(0, 40)`; if `c.tree.nonsense > 0.6` → the `notfound` entry.
- Activating `create` → `openApp({ id: newId(), title, prompt: q.trim().slice(0, MAX_PROMPT), tree: c.tree })`.
- `Preview` renders `<RenderTree tree={c.tree} state={previewState} dispatch={() => {}} preview />` inside the existing preview window chrome; with no tree yet show "Jev is designing…".
- `JevHud` becomes: `{c.offline ? <span className="badge warn">offline</span> : <span className="badge ok">Jev</span>} {c.composing ? "composing…" : `${c.calls} calls · ${c.ms} ms`}` plus a one-line `treeText(c.tree)` in `mono` (truncate with ellipsis).
- Keep `maxLength={MAX_PROMPT}` on the input.

- [ ] **Step 6: Task Manager** (`SystemApps.tsx`) — columns: **App** (title), **Layout** (`windows` payload tree is not stored; use `stats`): **Decisions calls**, **Compose time**, **Composed by** (Jev/offline). Read `useOS((s) => s.stats)` keyed by window id. Remove `SHELL_META` import.

- [ ] **Step 7: Typecheck** — `pnpm exec tsc --noEmit`. Fix only files touched in this task; the old shells/intent code is deleted in Task 10 (if `tsc` reports errors in files Task 10 deletes, leave them).

- [ ] **Step 8: Browser check (dev server :3001, gstack `browse`)**
1. Start → type `expense tracker for my tokyo trip`, pause: the preview window splits and fills level by level; HUD shows calls and ms.
2. Enter: window opens with that layout; within ~3–4 s data lands and Jev re-composes with bindings.
3. Use the form to add `ramen` / `980`: the record appears, stat numbers change, history line in the status bar, the layout re-composes without flicker of unchanged parts.
4. Type `food` in a search part (if composed): the list narrows after ~0.5 s.
Record findings in the commit message.

- [ ] **Step 9: Commit**

```bash
git add -A web/src/apps web/src/os web/src/system
git commit -m "OS: apps are composed live by Jev from the kit; Start shows the composition as you type"
```

---

### Task 10: Remove the old program model

**Files:**
- Delete: `web/src/shells/`, `web/src/lib/genshell/`, `web/src/lib/intent/` (all), `web/src/scenes/`, `web/src/os/useIntent.ts`, `web/src/assistant/InstallTray.tsx`, `web/src/app/api/intent/`, `web/src/app/api/shells/`, `web/src/lib/compose/{compose.ts,compose.test.ts,shapes.ts,skeleton.ts,skeleton.test.ts,adapt.ts}`, `web/src/lib/content/{schema.ts,schema.test.ts,client.ts,client.test.ts}` (move `ContentError` into `data.ts` first), old content functions in `server.ts`/`prompt.ts` (`generateContent`, `buildPrompt`) and their tests, `web/scripts/jev-smoke.mts`
- Modify: `web/src/os/OS.tsx` (drop `InstallTray`), `web/src/assistant/brain.ts` (drop install watching), `web/src/assistant/Assistant.tsx`, `web/src/components/win99/Widgets.tsx` (drop `Fmt` import from shapes: inline `type Fmt = "num" | "pct" | "text"`), `web/.gitignore` (drop `/.genshells/`), `web/.env.example` (drop `AI_GATEWAY_API_KEY`, `GENSHELL_MODELS`)

- [ ] **Step 1: Move `ContentError`** into `web/src/lib/content/data.ts` (`export class ContentError extends Error {}`) and update imports in `data.ts`, `server.ts`, `data.test.ts`.

- [ ] **Step 2: Delete**

```bash
git rm -rq web/src/shells web/src/lib/genshell web/src/lib/intent web/src/scenes web/src/os/useIntent.ts web/src/assistant/InstallTray.tsx web/src/app/api/intent web/src/app/api/shells \
  web/src/lib/compose/compose.ts web/src/lib/compose/compose.test.ts web/src/lib/compose/shapes.ts web/src/lib/compose/skeleton.ts web/src/lib/compose/skeleton.test.ts web/src/lib/compose/adapt.ts \
  web/src/lib/content/schema.ts web/src/lib/content/schema.test.ts web/src/lib/content/client.ts web/src/lib/content/client.test.ts web/scripts/jev-smoke.mts
```
Then remove `generateContent`, `once`, `cache`, `inflight`, `cacheKey` from `server.ts`; `buildPrompt`, `PROGRAM`, `SHAPE`, `ContentRequest` from `prompt.ts`; and the corresponding tests from `server.test.ts` (keep a `generateData` test: mock `GeminiCall` returning valid data JSON → returns `Data`; invalid twice → rejects; same prompt+nonce twice → one call).

- [ ] **Step 3: Assistant** — in `brain.ts` delete `onWindowsChanged`, `maybeInstallProgram`, `watchInstalls` and their imports; in `Assistant.tsx` stop calling them. Update `SUGGESTIONS` in `suggest.ts`:
```ts
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
```

- [ ] **Step 4: Find leftovers**

Run: `grep -rnE "@/shells|@/lib/genshell|@/lib/intent|@/scenes|useIntent|InstallTray|compose/(compose|shapes|skeleton|adapt)|content/(schema|client)|AppManifest|Bundle\b" src`
Expected: no output. Fix each hit.

- [ ] **Step 5: Verify** — `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → all succeed.

- [ ] **Step 6: Commit**

```bash
git add -A web
git commit -m "Remove fixed programs, generated programs and the intent classifier"
```

---

### Task 11: Copy, smoke script, docs, browser pass

**Files:**
- Create: `web/scripts/compose-smoke.mts` (+ `"smoke": "tsx scripts/compose-smoke.mts"` in `package.json`)
- Modify: `web/src/os/Welcome.tsx` (TRY list + "How it works"), `web/src/system/SystemApps.tsx` (About copy), `README.md`, `web/README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-07-jev-os-design.md` (header: superseded by 2026-10-09 composed UI)

- [ ] **Step 1: Smoke script**

```ts
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
```

- [ ] **Step 2: Copy**
- Welcome `TRY`: the 6 first `SUGGESTIONS` with one-line "what" each (e.g. `{ q: "expense tracker for my tokyo trip", what: "add a meal, watch the totals and the layout change" }`).
- Welcome "How it works": "As you type, **Jev** designs the app with the OpenAI Decisions API: it picks a layout, then what goes in each pane, then which data each part shows — one call per level, and you watch it happen. Press Enter and **Gemini** writes the starting data. Every click or search changes the app's state, and Jev re-designs the window for the new state. Nobody designed any of these screens."
- About: "Every window is designed live. Jev (OpenAI Decisions API, gpt-6-luna) chooses the layout, the parts and what each part shows, and re-designs it whenever you interact. Gemini writes the starting data. Nothing is saved."
- README / web/README / CLAUDE.md: replace the "8 programs × shape" pipeline with the composed-UI loop; remove AI Gateway / generated-program mentions; keep `OPENAI_API_KEY` + `GEMINI_API_KEY`.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`, then with the dev server up: `./node_modules/.bin/tsx scripts/compose-smoke.mts http://localhost:3001`.
Expected: all green; smoke `0 failed` with a compose p50/p90 line (put it in the commit body).

- [ ] **Step 4: Browser pass (gstack `browse`, record findings in the commit body)**
1. Expense tracker: add a row via the form → totals change → layout re-composes.
2. Reading list: tick a checklist item → it's struck through, history line appears.
3. "kanban for moving apartments": drag a card to another column.
4. A search part narrows a list after typing.
5. Gibberish ("asdfgh") → "cannot find asdfgh.exe".
6. Offline: set `NEXT_PUBLIC_USE_MOCK=true` is a build-time var — instead verify via the route test; skip in the browser.

- [ ] **Step 5: Commit**

```bash
git add -A README.md CLAUDE.md docs web
git commit -m "Composed UI: copy, docs and live smoke test"
```
