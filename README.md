# Jev OS

A Windows‑98‑styled desktop where **anything you type becomes an app**. Nothing on it was designed in advance: **Jev** (OpenAI's Decisions API) designs every window from a kit of parts while you type, **Gemini** writes the starting data, and every click re-designs the window for the new state.

Type into Start → *"expense tracker for my tokyo trip"*, *"reading list with what i've finished"*, *"kanban for moving apartments"* — and the app takes shape as you type.

- 💻 App and code map: [`web/`](web/) · Design: [`docs/superpowers/specs/2026-10-09-composed-ui-design.md`](docs/superpowers/specs/2026-10-09-composed-ui-design.md)
- 🗼 The ETHGlobal Tokyo 2026 version (every app an agent with an ENS name and a Sui wallet) is frozen on branch [`ethglobal-tokyo-2026`](../../tree/ethglobal-tokyo-2026).

## The idea

We think interfaces will be **generated on demand**: changing in real time, and personal to whoever is using them. No frontend to build, no app to install. Jev OS is an experiment in that idea: the UI is a function of the app's state, and the Decisions API is that function. Every app is ephemeral: close the window and it's gone.

## How a prompt becomes an app

1. **You type.** Jev designs the app with the OpenAI Decisions API, one call per level of the layout: first the window (split, stacked, tabs, a 2x2 dashboard…), then what goes in each pane (table, list, detail, form, stats, charts, kanban, checklist, calendar, search, notes…), then which data each part shows. You watch it build; the Start preview re-composes when you pause typing.
2. **You press Enter.** Gemini writes the starting data as typed collections (text, number, date, yes/no, choice), and Jev wires every part to it. Binding options come from the app's own fields, filtered by type, so a chart can only plot a number.
3. **You use it.** A click, tick, drag or search runs a plain-code operation (add, update, remove, select, filter, sort) and Jev re-designs the window for the new state, keeping the parts that didn't change. A full design takes about 3–4 calls (~0.6 s).

## Run it

```bash
cd web && pnpm install
# web/.env.local: OPENAI_API_KEY (Jev) + GEMINI_API_KEY (data and pictures)
pnpm dev
```
