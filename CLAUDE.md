# Suica OS — notes for Claude

Start every session by reading `docs/HANDOFF.md` (current state, decisions, next steps) and `docs/PRD.md` (product spec).

## Standing rules
- **Always pnpm** (`pnpm`, `pnpm dlx`, `pnpm exec`) — never npm/npx/yarn. The app lives in `web/`.
- **Only three tracks:** Sui DeFi & Payments, ENS (Best Use of ENSv2, Sepolia), Curvegrid Best Digital Asset Dashboard. Do not add 1inch or Intercepta.
- **Jev only on the critical path.** UI is composed in real time by Jev (TypeSafe AI) via Vercel AI Gateway (`AI_GATEWAY_API_KEY`, model `typesafe-ai/jev`). No LLM calls or loading/waiting screens in the app-creation path; an LLM may only add optional GSAP polish after load.
- **ENS names are for apps and folders only**, under `suica.eth`. Users are wallets, not names. First come, first served.
- **Apps are reusable and shareable** (published apps show up in Start menu search), not one-off tasks.
- **The signing dialog is fixed OS code.** Apps only propose transactions; never generate the approval surface.
- **Secrets:** `web/.env.local` holds real private keys (Sepolia, Sui, Enoki). Never print, log, or commit it. `web/.env.example` lists every variable name.
- **Don't install the Sui CLI** unless the user asks (they said no on 2026-09-26).
