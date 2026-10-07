# Jev OS

A Windows‑98‑styled desktop where **anything you type becomes an app**. Nothing on it was built as an app: every window is composed while you type by **Jev** (running on OpenAI's Decisions API), and **Gemini** writes what goes inside.

Type into Start → *"minesweeper but about cats"*, *"excel of the best ramen in tokyo"*, *"paint but roast my monday"*, *"notepad diary of a pirate"*, *"tetris but about sushi"* — and the app takes shape as you type.

- 💻 App and code map: [`web/`](web/) · Design: [`docs/superpowers/specs/2026-10-07-jev-os-design.md`](docs/superpowers/specs/2026-10-07-jev-os-design.md)
- 🗼 The ETHGlobal Tokyo 2026 version (every app an agent with an ENS name and a Sui wallet) is frozen on branch [`ethglobal-tokyo-2026`](../../tree/ethglobal-tokyo-2026).

## The idea

We think interfaces will be **generated on demand**: changing in real time, and personal to whoever is using them. No frontend to build, no app to install. Jev OS is an experiment in that idea. Every app is ephemeral: close the window and it's gone; type it again and it's made again.

## How a prompt becomes an app

1. **You type.** On every keystroke, one call to **Jev** answers a handful of typed questions in parallel: which program (Excel, Minesweeper, Paint, Notepad, Doom…), what shape of content (table, list, chart, gauge, poster, game board, document, picture), what tone, which animation. Typical latency: **~0.5 s** (p50 494 ms, p90 895 ms across 20 prompts). Jev never writes text or UI; it only picks from closed sets.
2. **Code builds the window** from those answers, and the Start menu shows a live preview that re-composes as you type.
3. **You press Enter.** The window opens instantly in the right shape, and **Gemini** writes the content into it as JSON, validated per shape before any program sees it (~2–3 s).
4. **Programs we don't have** ("tetris but …") are written once by an LLM in the background while your app keeps running in a stand-in program. They run sandboxed with no network access, are smoke-tested, and are instant for everyone after that.

## Run it

```bash
cd web && pnpm install
# web/.env.local: OPENAI_API_KEY (Jev) + GEMINI_API_KEY (content); optional AI_GATEWAY_API_KEY (new programs)
pnpm dev
```
