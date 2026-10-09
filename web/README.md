# Jev OS — web

Next.js 16 · React 19 · TypeScript · OpenAI Decisions API (Jev) · Gemini · zod · vitest. No UI framework — the Win98 kit is hand-written CSS.

## Run it

```bash
pnpm install
# web/.env.local
#   OPENAI_API_KEY=…       Jev (OpenAI Decisions API, gpt-6-luna)
#   GEMINI_API_KEY=…       starting data + pictures
pnpm dev                   # http://localhost:3000
```

Without `OPENAI_API_KEY` a rule-based layout is used instead, and the Start menu shows an "offline" chip.

## How a prompt becomes an app

```
Start (typing pause ~300 ms)
  → /api/compose   one Decisions call per step: node:<path> (container or part) + collection:<path>, per open node
                   repeated until the tree is complete (depth ≤ 3, ≤ 6 parts); the preview renders every step
Enter
  → /api/content   Gemini writes Data: typed collections of records (≤ 4 collections, 8 fields, 15 records)
  → /api/compose   re-compose with data, then one binding call: bind:<path>:<slot> per part slot (type-filtered options)
Interaction (click / tick / drag / search / submit)
  → applyOp        add | update | remove | select | filter | sort | clear — plain code, + one history line
  → /api/compose   re-design for the new state; unchanged parts keep their identity (no flicker)
```

**Jev decides, code applies, Gemini writes the data.** Jev only picks from options code offers; when siblings would repeat each other, code takes Jev's next most likely option.

## Map

| Path | What |
|---|---|
| `src/lib/kit/` | Types, catalog of containers/parts/slots, operations, tree helpers |
| `src/lib/compose/` | State → Decisions questions → tree; fallback layout; one-step server composer; client loop |
| `src/lib/decisions/` | OpenAI Decisions API client |
| `src/lib/content/` | Gemini data schema, prompt and call |
| `src/kit/` | React rendering of the tree: containers and the 14 parts |
| `src/apps/` | App window (state, operations, re-compose) and `useComposed` |
| `src/os/` | Desktop, Start menu (live composed preview), taskbar, Welcome, window store |
| `src/system/` | About, Task Manager (calls + compose time per app), UI Kit, message box |
| `src/assistant/` | Tappy |

## Checks

```bash
pnpm test                       # vitest
pnpm exec tsc --noEmit
pnpm lint
./node_modules/.bin/tsx scripts/compose-smoke.mts http://localhost:3000   # 20 apps composed live, compose p50/p90
```
