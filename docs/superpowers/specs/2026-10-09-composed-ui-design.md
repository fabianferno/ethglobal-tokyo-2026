# Jev OS: composed UI — design

Date: 2026-10-09 · Status: approved in chat, awaiting spec review · Supersedes the "8 fixed shells" model in
`2026-10-07-jev-os-design.md` (desktop, Start, Gemini, Decisions client, Tappy, rate limits stay).

## Goal

Show that the OpenAI Decisions API can **design a UI**, not just pick an app. Every app is composed from a kit of
containers and parts; the Decisions API chooses which parts, how they nest, what data each part shows and what
each control does. **The UI is a function of state**: every interaction changes the state, and Jev re-composes the
UI from the new state. Nobody designed any screen.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Arrangement | A tree, decided level by level (one Decisions call per depth) — approach A, recursive nodes. |
| Behaviour | Each state of the app decides how the app looks. Clicking or typing changes state → re-compose. |
| Data updates | Decisions picks each control's operation at compose time; code applies it deterministically. Gemini only writes the starting data. |
| Old programs | Dropped: 8 fixed shells and LLM-generated programs (Tetris) are removed. Kit only. |
| Reveal | Build visibly, level by level; in Start, re-compose on a typing pause (~300 ms); after a click, re-compose in place without flicker. |

## 1. State and the loop

One state object per app window (memory only; nothing saved):

```ts
type AppState = {
  prompt: string;
  data: Data;                  // collections of typed records (Gemini writes the first version)
  ui: { selected: Record<string, string | null>; filter: Record<string, string>; sort: Record<string, { field: string; dir: "asc" | "desc" }>; tab: Record<string, number> };
  history: string[];           // last events in plain text, newest last; Jev sees the last 5
};
type Field = { name: string; type: "text" | "number" | "date" | "yesno" | "choice"; values?: string[] };
type Collection = { name: string; fields: Field[]; records: (Record<string, string | number | boolean> & { id: string })[] };
type Data = { collections: Collection[] };
```

**Opening an app**
1. Typing in Start: after a ~300 ms pause, Jev composes the tree from the prompt alone (no data yet → no binding call); the
   preview builds level by level with labelled placeholder parts ("table of …").
2. Enter → the window opens with that tree; **Gemini writes `data`** (the only Gemini call in the app's life).
3. Jev re-composes with the data present (now binding questions exist); nodes that didn't change don't re-render.

**Each interaction**
1. Click a control / submit a form / select / search (search and form inputs are local until submit or a 500 ms pause).
2. The control's bound operation runs in code on `data`/`ui`, appending a history line.
3. Jev re-composes from the new state; the tree is diffed against the old one.

**Jev's input** (one compact text per call): prompt; data schema (collection names, fields + types, record counts — not
all rows; plus up to 3 sample records per collection); `ui`; last 5 history lines; the tree so far with the open nodes
marked; the path and position of each open node.

**Caps (code-enforced):** depth ≤ 3, ≤ 4 children per container, ≤ 6 parts per app.

## 2. The kit

**Containers** (child count is part of the option): `split-h-2`, `split-h-3`, `split-v-2`, `split-v-3`, `tabs-2`,
`tabs-3`, `grid-4` (2×2).

**Parts** (leaves) and their binding slots:

| Part | Shows | Slots | Operation |
|---|---|---|---|
| `table` | rows/columns | collection, col1..col4 (any field or none) | select row; header click = sort |
| `list` | items + subtitle | collection, title (text), subtitle (any or none) | select |
| `detail` | selected record's fields | collection | — |
| `form` | inputs + submit | collection, field1..field4 (any or none) | add record |
| `stat-row` | 1–3 big numbers | collection, agg1..agg3 (`count`, `sum:<number field>`, `avg:<number field>`, none) | — |
| `bar-chart` | bars | collection, label (text/choice), value (number) | select |
| `line-chart` | trend | collection, value (number), order (date or none) | — |
| `kanban` | cards in columns | collection, column (choice), title (text) | move card → update column field |
| `checklist` | tickable items | collection, title (text), done (yesno) | toggle → update done field |
| `calendar` | month with dots | collection, date (date), title (text) | select day → filter by date |
| `search` | text box | collection, field (text/choice) | filter |
| `button-bar` | 1–3 buttons | collection, btn1..btn3 (`remove-selected`, `clear-selection`, `clear-filter`, `sort:<field>`, none) | that operation |
| `note` | paragraph | collection, text field (first record) | — |
| `picture` | Gemini image of the prompt subject (`/api/image`) | — | — |

Binding options are **generated from this app's data and filtered by type**; Jev can never bind a missing or
mistyped field. Look: existing Win98 kit (`win99.css`, `Widgets.tsx` list view / charts / group boxes). One extra
first-call choice, `accent` (6 colours), tints the window.

**Operations** (pure functions `(state, op, input) → state`): `add`, `update`, `remove`, `select`, `filter`, `sort`,
`clear`. Each appends a history line, e.g. `added {item: ramen, amount: 980} to expenses`.

## 3. The composer

**Tree calls.** Call *d* asks, for every open node at depth *d*, in parallel:
- `node:<path>` — choice over containers + parts (each with a one-line description); instructions describe the node's
  place ("right pane of a side-by-side split in an expense tracker").
- `collection:<path>` — choice over collections (only when there are ≥ 2; ignored if the node is a container).
- Call 1 also asks `accent` and predicate `nonsense`.

Containers create open children for call *d+1*; parts stop. **Binding call** (only when data exists): one call with
every slot of every part as a choice over that slot's type-filtered options (+ `none` where optional).

Typical compose = depth calls + 1 binding call ≈ 3–4 calls ≈ 1–1.2 s. Each call's answers render immediately.

**Caps in the options:** at depth 3 only parts are offered; containers whose children would exceed the 6-part budget are
removed from the options.

**Stability:** the previous tree is part of the input. Diff by node identity = path + type + bindings; unchanged nodes
keep their DOM (scroll, focus, typed text); changed nodes fade in.

**Failure:** refusal / timeout (4 s per call) / no key → rule-based fallback tree (list + detail when a choice field
exists, else table + form; bound to the first fields by type), and the "offline" chip. Gemini data failure → error panel
with Try again (as today). A render error in a part is caught per window (existing error boundary).

## 4. Removed

Fixed shells (`web/src/shells/*` except the frame), `lib/compose/functions`-era code: skeleton bundles, per-shape content
schemas and `/api/content`'s shape contract (replaced by a data contract), scene strips, the generated-program stack
(`lib/genshell`, `InstallTray`, `GeneratedShell`, `/api/shells`, `.genshells`), Tetris.

## 5. Kept

Desktop, Start, taskbar, windows, Welcome + About (copy rewritten), Task Manager (shows calls + compose time per app),
Tappy (greeting + idle suggestions, new suggestion list), Decisions client (generalised to arbitrary question lists),
rate limits, error boundary, `/api/image` (for `picture`), `/api/content` (now returns `Data`).

## 6. Testing

- vitest: composer (asks exactly the open nodes per depth; caps; type-filtered options; collection question skipped
  for one collection; tree validity; fallback on refusal/timeout), operations (each op + edge cases: empty collection,
  remove the selected record, filter to nothing), diff identity, Gemini data schema (≤ 4 collections, ≤ 8 fields,
  ≤ 15 records; choice fields have values).
- Smoke script: 20 prompts composed live (tree + data + bind); every tree valid, every binding points at a real field;
  prints compose p50 / p90.
- Browser pass: expense tracker (add a row → stats change), reading list (tick checklist), kanban (move a card),
  search narrows a list.

## Demo moment

Type "expense tracker for my tokyo trip", pause → the window splits, fills, data lands. Add "ramen ¥980" → the stats row
updates and the layout re-composes. Type "food" in search → Jev reshapes the UI around the filtered list.
