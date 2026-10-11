# Jev OS: app characters and a richer kit — design

Date: 2026-10-11 · Status: approved in chat, awaiting spec review · Extends `2026-10-09-composed-ui-design.md`
(state loop, operations, binding, fallback, budget all unchanged unless stated).

## Problem

Almost every app composes as two equal side-by-side panes. Measured cause: Jev's own root prior is ~75% `split-h-2`;
our blanket nudges ("a single part is rarely enough", fixed two-pane roles "the items" / "a way to add") and 60%
stickiness collapse it further; and equal-width panes make different apps look the same.

## Goal

Apps feel designed for the request: a moon heist looks like a board, a running log like a dashboard, a plant
collection like a gallery. Jev still decides everything; the kit gives it more distinct, proportioned building blocks
and an app *character* that shapes the options.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Direction | App character + richer kit. |
| Layout | Free tree (level by level, as now), shaped by the character — not fixed templates. |
| Nudges | Remove the blanket root nudge and fixed two-pane roles; role hints come from the character. Stickiness 0.6 → 0.4. |

## 1. Characters

`CHARACTERS = dashboard | tracker | board | planner | gallery | scoreboard | journal`, each with a description Jev
sees, a set of favoured containers, role hints per container, and favoured parts.

| Character | For | Favoured containers | Favoured parts |
|---|---|---|---|
| dashboard | numbers and trends | header, grid-4, side-2-1 | hero-number, line-chart, bar-chart, progress, table, stat-row |
| tracker | logging items over time | header, side-2-1 | table, form, stat-row, line-chart |
| board | things moving through stages | header, inspector | kanban, detail, checklist, form |
| planner | things on dates | sidebar, header | calendar, timeline, checklist, form |
| gallery | browsing a collection | hero, inspector | card-gallery, detail, search |
| scoreboard | ranking and competition | header, side-2-1 | leaderboard, hero-number, bar-chart, stat-row |
| journal | writing entries | sidebar | list, note, form, timeline |

**How it shapes composition.** The first call asks, in parallel (speculative fan-out — one Decisions call):
- `character` — choice over the 7 characters;
- `node:root|<character>` for each character — the root question with that character's favoured containers first and
  its role-aware descriptions; plus `accent`, `nonsense`;
- `collection:root` when there are ≥ 2 collections.

Code takes `character`, then reads `node:root|<that character>`. Later calls use the chosen character's role hints
and favoured-part ordering. The character is stored on the tree (`Tree.character`) and shown in Task Manager and
"How was this made?". All containers and parts stay available (within caps and bindability); favoured ones are listed
first and described as a good fit ("Good for a board: …").

**Role hints** now come from `(character, container, index)`, e.g. board+header: `["the app's title and key numbers",
"the stages"]`; dashboard+grid-4: `["the headline number", "the trend", "the breakdown", "the items"]`. A fallback
role table covers containers a character doesn't favour.

**Stickiness** (keep a pane's previous type on re-compose) drops from 0.6 to 0.4 of the top probability.

## 2. Containers (new + existing)

| Container | Children | Proportions |
|---|---|---|
| `header` | 2 | top band ~20% / body |
| `sidebar` | 2 | left 1 : right 3 |
| `inspector` | 2 | left 3 : right 1 |
| `side-2-1` | 2 | left 2 : right 1 |
| `hero` | 2 | top ~40% / bottom |
| `split-h-2`, `split-h-3`, `split-v-2`, `split-v-3`, `tabs-2`, `tabs-3`, `grid-4` | as before | equal |

Caps unchanged: depth ≤ 3, ≤ 4 children, ≤ 6 parts. `header`/`hero` render their first child as a band with the accent
colour.

## 3. New parts

| Part | Shows | Slots | Operation |
|---|---|---|---|
| `title-bar` | app name (from the prompt) + up to 3 key numbers, bold band | collection, agg1..agg3 (optional) | — |
| `hero-number` | one huge number + caption | collection, value (`count`, `sum:`, `avg:`, `pct:`) | — |
| `card-gallery` | grid of cards: title, subtitle, coloured badge | collection, title (text), subtitle (any, opt), badge (choice, opt) | select |
| `timeline` | entries by date down a line, today marked | collection, date (date), title (text), note (any, opt) | select |
| `leaderboard` | ranked rows, medals for top 3, score bars | collection, name (text), score (number) | select |
| `progress` | bar per item (value vs max) or overall share done | collection, label (text), value (number or yesno) | select / toggle (yesno) |

New aggregate everywhere aggregates are offered: `pct:<yesno field>` = share of records where it's true (0–100).
Badge/medal colours: a stable colour per choice value.

## 4. Unchanged

State and operations, binding (type-filtered options from the app's data), de-duplication by Jev's own probabilities,
detail-follows-selection, fallback tree (gains `character: "tracker"`), `/api/compose` validation (extended to the new
types), budget and rate limits, StrictMode-safe parts, error boundary.

## 5. Testing

- Unit: character fan-out questions (one `node:root|c` per character, favoured containers first), applyLevel reads the
  chosen character's root answer, role hints per character, stickiness 0.4, new containers' child counts, new parts'
  slot filtering and `canBind`, `pct` aggregate (incl. empty collection → 0), `validTree` accepts new types.
- Smoke: 20 prompts live + a **variety report**: count per character, per root container, part frequencies. Target: no
  single root container above 40% of apps; at least 4 characters used.
- Browser: a board (heist), a gallery (dragon's hoard), a scoreboard (reality show), a planner (training plan) —
  interact with each.
