# Jev OS — notes for Claude

Start every session by reading `docs/superpowers/specs/2026-10-09-composed-ui-design.md` (current design). `docs/PRD.md` and `docs/HANDOFF.md` describe the old ETHGlobal crypto version, which lives on branch `ethglobal-tokyo-2026`.

## Standing rules
- **Always pnpm** (`pnpm`, `pnpm dlx`, `pnpm exec`) — never npm/npx/yarn. The app lives in `web/`.
- **Product:** Jev OS. Jev composes every app from a kit of containers and parts via the OpenAI Decisions API (`POST /v1/decisions`, `OPENAI_API_KEY`, model `gpt-6-luna`), one call per tree level plus a binding call. The UI is a function of state: interactions run plain-code operations, then Jev re-composes. Gemini writes only the starting data (`/api/content`, `GEMINI_API_KEY`). No crypto, no fixed programs, no generated code.
- **Every app is ephemeral.** It lives only in its window: no saving, publishing, sharing, desktop app icons or folders.
- **Tappy** (the assistant) speaks only in balloons with buttons, from fixed templates (no free text): greeting and one idle prompt suggestion.
- **Secrets:** `web/.env.local` holds real keys. Never print, log, or commit it. `web/.env.example` lists every variable name.
- **Checks:** `pnpm test` (vitest), `pnpm exec tsc --noEmit`, `pnpm lint`, and `scripts/compose-smoke.mts` against a running dev server (20 apps composed live, prints compose p50/p90).
