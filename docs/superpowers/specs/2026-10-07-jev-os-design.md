# Jev OS — design

Date: 2026-10-07 · Status: approved in chat, awaiting spec review · Supersedes the crypto product in `docs/PRD.md`
(the ETHGlobal version is frozen on branch `ethglobal-tokyo-2026`).

## Goal

Turn Suica OS into **Jev OS**: a Win98-style desktop where anything you type becomes a working app, live.
**Jev picks the interface** (program, content shape, tone, animation) on every keystroke; **an LLM writes the
content**. No crypto, no saving, no publishing. It ships for a tweet + write-up, so the demo path must be fast,
honest ("composed by Jev" is literally true), and never crash.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| App content | Jev composes the UI; an LLM generates the content (text, rows, numbers, images). |
| Persistence | Every app is realtime and ephemeral. Closing the window ends it. No saving, publishing, sharing, desktop app icons, folders. |
| Tappy | Kept as a helper: welcome, prompt suggestions, "program installed" notices. Template copy only. |
| Name | Jev OS everywhere. |
| Models | Jev via Vercel AI Gateway (`typesafe-ai/jev`, verified working 2026-10-07 after credit top-up, ~0.4s warm). Content via Gemini Flash (`GEMINI_API_KEY`). Images via existing `/api/image` (Gemini). Generated shells via gateway (`GENSHELL_MODELS`). |

## How an app is made

1. **Keystroke → Jev (unchanged mechanics).** `useIntent` → `POST /api/intent` → `classifyWithJev`, with the
   existing anti-flicker gate, cache and offline fallback. The Start-menu preview re-composes per keystroke.
2. **New question schema** (`lib/intent/questions.ts`), money removed:
   - `shell` — unchanged list (excel, minesweeper, doom, paint, weather, notepad, hologram, explorer, unspecified).
   - `shape` (replaces `fn`) — what the content is: `table`, `list`, `series` (chart over time), `gauge`
     (one value + caption/forecast), `scene` (headline, verdict, lines, stats — the roast/poster shape),
     `grid` (cells with a risk score — Minesweeper/Doom), `document` (prose → Notepad), `picture` (an image).
   - `vibe` — serious, playful, roast, hype, chill (copy rewritten without "bullish/to the moon").
   - `scene` (animation) — retagged: `sparkle`, `ticker`, `storm`, `rocket`, `sakura`, `pool`, `fire`, `none`.
   - `nonsense` — gibberish / not an app request.
   - Removed: `readOnly`, `recurring`, `risk`, candidate `matchQuestions` (no published apps).
3. **Enter → window opens instantly** with a **skeleton bundle** for the chosen shape (placeholder rows /
   bars, a "Jev is writing…" subtitle), rendered by the chosen shell.
4. **Content → `POST /api/content`** `{ prompt, shell, shape, vibe }` → Gemini Flash with a JSON response
   schema for exactly that shape → validated with zod → `Bundle`. `useLiveBundle` already does
   "instant base, then live" — the base becomes the skeleton, the live fetch becomes `/api/content`.
   - Sizes are capped in the schema (≤ 12 rows, ≤ 8 columns, ≤ 60 series points, ≤ 10 list items,
     grid ≤ 8×8, document ≤ 2,000 chars) so shells never overflow.
   - `picture` shape and any `params.image` ("… with a picture of X") use `/api/image` as today.
   - Failure (timeout 20s, invalid JSON twice) → the window shows a Win98 error panel: "Couldn't write this
     one." with a **Try again** button. Never throws into React.
   - Rate-limited with the existing `lib/ratelimit.ts`; in-memory LRU cache keyed by
     `(prompt, shell, shape, vibe)` so the Start preview and the opened window share one generation.
   - Preview (Start-menu pane) shows the skeleton only — content is generated on Enter, not per keystroke.
5. **Program we don't have** ("tetris but about cats") — genshell flow unchanged in the client (fallback shell
   opens instantly, install tray, smoke test, swap). Server storage changes from Walrus + ENS to a **disk cache**
   (`web/.cache/shells/<label>.html` + index JSON, gitignored), so a program is written once per server and then
   instant for every user. This is an internal cache, not user-facing saving. The generated program receives the
   same `Bundle` it does today.

## Shells × shapes

`SHELL_META.accepts` stays; `defaultFn` becomes `defaultShape`. Adapters in `compose/adapt.ts` keep a named shell
honored for any shape (Minesweeper builds a field from numbers, Weather derives a gauge, Paint draws a list).
New: `document` is accepted by Notepad and Explorer; `picture` by Paint, Picture, Explorer.
`Fmt` drops `usd`/`token` in favor of `num`, `pct`, `text`, plus a free `unit` string on columns/series.

## What is removed

- `web/src/lib/{sui,ens,defi,portfolio,chain}`, `web/move/`, `web/src/app/api/{sui,ens,defi,portfolio,prices,gas}`.
- `compose/functions.ts` (≈30 money functions) → replaced by `compose/skeleton.ts` (skeleton per shape) and
  `lib/content/` (prompt, schema, server call).
- In `compose/shapes.ts`: `TxProposal`, `SuiIntent*`, `Action.tx`. Actions remain only as in-app buttons
  ("Regenerate", "Copy") — no transactions.
- `system/Dialogs.tsx`: Signing dialog, BSOD-for-rogue-agent, Log-on-with-Google. Generic message box stays.
- `system/SystemApps.tsx`: AgentVault drive, agent wallets, Network Neighborhood, FolderView, folder roles,
  Recycle Bin of saved apps. My Computer becomes an About box ("Jev OS — interfaces composed by Jev").
  Task Manager keeps only running windows (+ Jev latency per app, a nice demo stat).
- `os/store.ts`: ENS index, mint/publish/alias, device key, usernames, desktop `app`/`folder` items, Activity
  log of payments. Windows hold their `AppManifest` in memory only. Desktop shows system icons only.
- `assistant/brain.ts`: cap/approval/settle/price rules. Keeps welcome, install-progress and a new
  "try this prompt" rule (on idle desktop, one suggestion from a fixed list, max once per session).
- `searchRank.ts` published-app search, `scripts/{ens-*,sui-*,qa-*}` that hit removed routes, package scripts
  `ens:*`/`sui:*`, deps `@mysten/sui`, `@mysten/enoki`, `viem`.
- `.env.example`: Sepolia/Sui/Enoki/Google vars removed. `web/.env.local` is not touched.

## What stays

Win98 kit, desktop, windows, Start menu, taskbar, sounds, Welcome dialog (copy rewritten: "interfaces will be
generated on demand… Jev OS is an experiment in that idea", sections: What is this / Type anything / How it
works), all shells incl. Doom/Hologram/Picture, GSAP scenes, genshell sandbox runtime
(`sandbox="allow-scripts"`, no-network CSP, `suica.propose` renamed to `jev.action` for in-app buttons only).

## Rename

User-visible: "Suica OS" → "Jev OS" in Welcome, boot, Start banner, window titles, `<title>`/metadata, Tappy copy,
README, `CLAUDE.md`. Logo keeps the mint accent on "OS". Code identifiers containing `suica` (e.g. the iframe
bridge global) renamed to `jev`. `docs/PRD.md` / `HANDOFF.md` get a header pointing to this spec; old content
moves under "ETHGlobal version (branch ethglobal-tokyo-2026)".

## Error handling

- Jev down → offline classifier (existing), Start menu shows a small "offline" chip so the demo is honest.
- Content failure → in-window error panel + Try again (above).
- Image failure → Picture shows "Couldn't draw this one" (existing).
- Genshell failure → stays in fallback shell, tray shows failed (existing).
- Any malformed bundle is rejected by zod at the API, so shells only ever see valid shapes.

## Testing

- `pnpm exec tsc --noEmit` and `pnpm lint` clean.
- `scripts/jev-smoke.ts`: ~20 fixed prompts → `/api/intent` (asserts `source !== "mock"`, records latency) and
  `/api/content` (asserts zod-valid bundle for the chosen shape).
- Unit tests for the content zod schemas and skeleton builders (shape coverage).
- Manual browser pass: per-keystroke preview, Enter → content fills, `tetris but about cats` install, picture
  prompt, Tappy suggestion, error panel via a forced failure.

## Out of scope

Accounts, persistence, sharing, any crypto, deploy changes (Vercel deploy can follow as its own task).
