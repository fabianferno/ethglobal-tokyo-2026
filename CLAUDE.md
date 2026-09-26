# Suica OS — notes for Claude

Start every session by reading `docs/HANDOFF.md` (current state, decisions, next steps) and `docs/PRD.md` (product spec).

## Standing rules
- **Always pnpm** (`pnpm`, `pnpm dlx`, `pnpm exec`) — never npm/npx/yarn. The app lives in `web/`.
- **Only three tracks:** Sui DeFi & Payments, ENS (Best Use of ENSv2, Sepolia), Curvegrid Best Digital Asset Dashboard. Do not add 1inch or Intercepta.
- **Jev composes instantly; an LLM may only extend the SHELL axis, in the background.** UI is composed in real time by Jev (TypeSafe AI) via Vercel AI Gateway (`AI_GATEWAY_API_KEY`, model `typesafe-ai/jev`). The app always opens instantly in a built-in shell. When a prompt names a program we don't have ("tetris but my portfolio"), an LLM writes that *shell* once while the app keeps running in its fallback shell (tray install, no blocking screen). The shell is smoke-tested, published to Walrus + `<label>.shells.suica.eth`, and then instant for everyone (decided 2026-09-26, reversing "no LLM in app creation"). Generated shells never write app logic, functions or numbers.
- **Generated code is an untrusted guest.** It runs in a `sandbox="allow-scripts"` iframe (never add `allow-same-origin`) with a no-network CSP. Data is pushed in; the only way out is `suica.propose(actionId)` for an action the trusted function already built. See `web/src/lib/genshell/runtime.ts`.
- **The assistant (Tappy) is one OS-wide agent.** It speaks only in balloons with buttons, using templates filled with real numbers (no free text). It stays quiet unless a code-side threshold is met. It acts on its own only within the owner's cap; over the cap it asks through the signing dialog, and the on-chain AgentCap is the final guard.
- **Wild apps show real data.** Read-only portfolios of any ENS name come from `/api/portfolio` (mainnet ENS + Ethplorer). "Loss" means the labelled 30-day price change on current holdings, not cost basis.
- **ENS names under `suica.eth`**: apps and folders, plus one username per user at `<name>.users.suica.eth` (points at the user's browser device key, non-transferable; decided 2026-09-26). First come, first served.
- **Apps are reusable and shareable** (published apps show up in Start menu search), not one-off tasks.
- **The signing dialog is fixed OS code.** Apps only propose transactions; never generate the approval surface.
- **Secrets:** `web/.env.local` holds real private keys (Sepolia, Sui, Enoki). Never print, log, or commit it. `web/.env.example` lists every variable name.
- **Don't install the Sui CLI** unless the user asks (they said no on 2026-09-26).
