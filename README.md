# Suica OS — ETHGlobal Tokyo 2026

A fully hallucinated, Windows‑99‑styled operating system where **every app is an agent** with an ENS name and a Sui wallet, and every UI is composed **in real time by Jev** (TypeSafe AI) — no LLM on the critical path.

Type anything into Start → *"minesweeper but 20x leverage SUI futures"*, *"excel of fabianferno.eth's portfolio"*, *"split bills with 4 friends"* — and a working agent app appears as you type.

- 📄 Product spec: [`docs/PRD.md`](docs/PRD.md)
- 💻 App: [`web/`](web/) (Next.js 16)
- 🏆 Tracks: Sui DeFi & Payments · ENSv2 · Curvegrid Digital Asset Dashboard

## Quick start

```bash
cd web
pnpm install
cp .env.example .env.local   # optional: add AI_GATEWAY_API_KEY to use Jev online
pnpm dev                      # http://localhost:3000
```

Without a key the OS runs on an offline keyword classifier with the exact same output shape as Jev (HUD shows `jev-offline`).
