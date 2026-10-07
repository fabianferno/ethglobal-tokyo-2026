# Jev OS — notes for Claude

Start every session by reading `docs/superpowers/specs/2026-10-07-jev-os-design.md` (current design). `docs/PRD.md` and `docs/HANDOFF.md` describe the old ETHGlobal crypto version, which lives on branch `ethglobal-tokyo-2026`.

## Standing rules
- **Always pnpm** (`pnpm`, `pnpm dlx`, `pnpm exec`) — never npm/npx/yarn. The app lives in `web/`.
- **Product:** Jev OS. Jev composes each app's UI on every keystroke (shell × shape × vibe × scene) via the OpenAI Decisions API (`POST /v1/decisions`, `OPENAI_API_KEY`, model `gpt-6-luna`; decided 2026-10-07, replacing TypeSafe via Vercel AI Gateway). Gemini writes the content through `/api/content` (`GEMINI_API_KEY`), validated by per-shape zod schemas. No crypto anywhere.
- **Every app is ephemeral.** It lives only in its window: no saving, publishing, sharing, desktop app icons or folders.
- **New programs** ("tetris but …") are written once by an LLM in the background while the app runs in its fallback shell, smoke-tested in the browser, then cached on the server (`web/.genshells/v2/`) and instant for everyone. Generated shells never write app logic or content.
- **Generated code is an untrusted guest.** It runs in a `sandbox="allow-scripts"` iframe (never add `allow-same-origin`) with a no-network CSP. Data is pushed in; the only way out is `jev.action(actionId)` for an action already in the bundle. See `web/src/lib/genshell/runtime.ts`.
- **Tappy** (the assistant) speaks only in balloons with buttons, from fixed templates (no free text): greeting, one idle prompt suggestion, install progress.
- **Secrets:** `web/.env.local` holds real keys. Never print, log, or commit it. `web/.env.example` lists every variable name.
- **Checks:** `pnpm test` (vitest), `pnpm exec tsc --noEmit`, `pnpm lint`, and `scripts/jev-smoke.mts` against a running dev server (20 prompts end to end, prints Jev p50/p90).
