# ETHGlobal Tokyo 2026 — Suica OS submission

---

## Short description *
_A max 100-character description of your project (it should fit in a tweet!)_

> Type anything; it becomes a Win99 app with its own ENS name & Sui wallet, composed live by Jev.

---

## Description *
_Go in as much detail as you can about what this project is._

![Suica OS — type anything, get an app](https://raw.githubusercontent.com/fabianferno/ethglobal-tokyo-2026/main/docs/assets/suica-pipeline.png)

**Suica OS is a fully hallucinated, Windows-99-styled operating system where every app is an agent.** There is no landing page and nothing was built as a normal app. You boot into a retro desktop, open the Start menu, and **type anything** — *"excel of vitalik.eth's portfolio"*, *"paint but roast vitalik.eth"*, *"doom but I'm shooting my losses"*, *"split bills with 4 friends"*, *"tetris but my portfolio"* — and a working, on-chain app appears **instantly** as a chunky retro window, as fast as you can type.

**Why we built it.** We're heading toward a future where we don't need apps for everything — agents do the work. But we still need interfaces: to *see* what our agents did, understand it, and approve or refuse it. So interfaces will be **generated on demand** — changing in real time, personal to whoever is using them. Suica OS is an experiment in that idea: an OS where every window is composed live, every app has an identity, and every dollar it moves is gated on-chain.

**Apps are places, not programs.** Every app is really an *agent*: an **ENSv2 name** (its identity + a ~1 KB manifest stored in its text records) plus a **Sui wallet** (an `AgentVault` with spend caps). The UI is disposable — anyone who resolves the name can rebuild the exact UI instantly, no model call. `suica.eth` becomes a real filesystem: **folders are ENS registries, sharing is Enhanced Access Control roles, and moving an app into a folder turns its old name into an ENSv2 alias — a symlink — so old share links keep working.**

**The numbers are real.** Portfolios, roasts and "losses" come from Ethereum mainnet (ENS + Ethplorer); balances, gas and payments come from Sui. **Log on with Google** (zkLogin — no seed phrase) and gas is **sponsored**, so you never hold SUI. Money only moves through one **fixed signing dialog** that is never generated; apps can only *propose*. An assistant, **Tappy**, acts on its own within a cap you set, asks when it's over, and if it ever tries to overspend the **Move contract rejects it on-chain and you get a Blue Screen** — no funds move.

**"Anything is possible."** Ask for a program we don't have ("tetris but…") and it opens instantly in a built-in "compatibility mode" shell while an LLM writes the real shell in the background — sandboxed, tested, published to **Walrus** and named under `shells.suica.eth`, so it's instant for everyone after that.

Tracks: **Sui DeFi & Payments**, **ENS (Best Use of ENSv2, on Sepolia)**, **Curvegrid (Best Digital Asset Dashboard)**.

---

## How it's made *
_The nitty-gritty. What technologies did you use? How are they pieced together?_

![Suica OS — how the tech fits together](https://raw.githubusercontent.com/fabianferno/ethglobal-tokyo-2026/main/docs/assets/suica-architecture.png)

**Frontend / OS shell.** Next.js 16 + React 19 + TypeScript. No UI framework — the "Windows 99" kit is hand-written CSS (`win99.css`) with a custom window manager, taskbar, Start menu, and a real BSOD. GSAP powers ~20 hand-built animation scenes.

**The real-time UI engine is Jev (TypeSafe AI), not an LLM.** On every keystroke we make **one** call to Jev — a "System One" model that never writes text, it only answers ~20 typed questions (`choice`/`score`/`noul`) in parallel with calibrated probabilities in ~70–500 ms. Jev decides *shell × function × target × vibe × risk*; a deterministic parser extracts the numbers (ENS names, tokens, amounts, leverage, schedules). **Jev decides, code computes** — a model never invents an amount. We route Jev through the **Vercel AI Gateway**. An offline keyword classifier with the identical output shape keeps the demo alive without a key. 6 data *shapes* (Table, TimeSeries, List, RiskyGrid, Gauge, Scene) let any of ~40 shells render any of ~30 functions — ~1,200 apps from one classifier call.

**ENS is the filesystem (ENSv2 on Sepolia).** We registered `suica.eth` and deployed our **own UserRegistry + PermissionedResolver**. Apps and folders are minted as subnames; the full manifest lives in the `suica.manifest` text record and the app index is read from `LabelRegistered` events. **Folders are their own registries; sharing grants Enhanced Access Control (EAC) roles** (member can mint into a folder, manager can also share) — every mint/share request is EIP-191-signed by a per-browser **device key**, and the server enforces roles on-chain (mint into a folder without `ROLE_REGISTRAR` → 403). Each app deploys its **own PermissionedResolver** (creator's key holds root roles; the server keeps only argument-scoped setter roles, then revokes its root). Each user auto-claims a non-transferable username at `<name>.users.suica.eth`. **Moving an app re-mints it and links the old name to the new record (an ENSv2 alias / symlink)**, so old share links resolve live data.

**Sui is where the money moves.** **Enoki zkLogin** (Google → wallet, key stays server-side, proxied through our API) + **Enoki sponsored transactions** (users never hold SUI). We wrote and published a Move package, **`AgentVault<T>`**: share tokens for depositors, an **`AgentCap`** permission slip (per-tx / per-day caps, recipient allowlist, expiry) and `fee_bps` to the creator. `agent_pay` **aborts on-chain when it exceeds a cap** — that Move abort is what drives the BSOD, and it's proven live (abort code 2 = EOverTxCap). We use **PTBs** for atomic multi-party settlement: **Group Tab** (settle each member in one sponsored PTB) and **Programmable Payroll** (`agent_pay` per recipient in one batch — over-budget reverts the *whole* batch). Because DeepBook testnet has no liquidity, we deployed our **own mock AMM pool** (a `susd` coin + constant-price `pool` Move package) to make **Rebalancer** and **DCA** real, gasless SUI→SUSD swaps. An app's vault id is written into its ENS record under **Sui coin type 784**, so `grouptab.suica.eth` resolves to its Sui vault. Sui reads/writes go over **gRPC** (`SuiGrpcClient`), since public JSON-RPC is deprecated.

**Generated shells run as an untrusted guest.** When a prompt names a program we don't have, an LLM (via the AI Gateway) writes an HTML shell once, in the background. It's statically checked, smoke-tested in a hidden sandbox, then stored on **Walrus** with its sha256 and named at `<label>.shells.suica.eth`. It runs in a `sandbox="allow-scripts"` iframe with a no-network CSP — data is pushed in, and the only way out is proposing an action the trusted code already built.

**The dashboard (Curvegrid track).** Task Manager shows every agent as a process with real balances and "End Process = revoke AgentCap"; My Computer shows the live **AgentVault** as a drive with a real balance + day-cap usage bar, reading on-chain vault/cap state (funds, fee_bps, caps, spent_today) every 15s.

**Hacky bits worth noting:** we compile Move without a local Sui CLI by using a Dockerized `mysten/sui-tools` image with the framework vendored as a local sparse clone (the emulated container can't git-fetch); all tx-building/simulation/gRPC live server-side to dodge gRPC-web CORS (the browser only signs sponsored bytes and assembles the zkLogin signature); and the smoke-test iframe sits on-screen at 0.01 opacity because Chrome pauses rAF in hidden cross-origin frames.

---

## Screenshots (get 6)

Capture these six (the Welcome dialog is the "landing page"):

1. **Boot + Welcome to Suica OS** dialog on the retro desktop (the thesis).
2. **`excel of vitalik.eth portfolio`** — a real wallet as a spreadsheet, `=PNL()` and Chart Wizard.
3. **`paint but roast vitalik.eth`** — MS Paint roasting real holdings ("AIRDROP LANDFILL").
4. **Network Neighborhood / the `suica.eth` tree** — folders + published apps (ENS-as-filesystem), plus a folder Share (EAC role grant).
5. **The fixed Signing dialog** on a Sui payment (decoded tx, risk badge, AgentCap check) — and/or the **BSOD** after a rogue over-cap `agent_pay`.
6. **Task Manager / My Computer** — the digital-asset dashboard: agents as processes, AgentVault drive with real balance + day-cap bar (Curvegrid).

---

## Sponsor tracks

Base for code links: `https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/`

### 🟦 Sui — DeFi & Payments

**Where in the code**
- Move `AgentVault<T>` (caps, `agent_pay`, on-chain abort → BSOD): [`web/move/suica_vault/sources/vault.move`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/move/suica_vault/sources/vault.move)
- Mock AMM pool for real swaps/DCA/rebalance: [`web/move/suica_pool/`](https://github.com/fabianferno/ethglobal-tokyo-2026/tree/main/web/move/suica_pool)
- zkLogin + sponsored-tx routes: [`web/src/app/api/sui/zklogin/`](https://github.com/fabianferno/ethglobal-tokyo-2026/tree/main/web/src/app/api/sui/zklogin) · [`web/src/app/api/sui/sponsor/route.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/app/api/sui/sponsor/route.ts) · [`web/src/app/api/sui/execute/route.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/app/api/sui/execute/route.ts)
- Payroll PTB (atomic batch, over-budget reverts): [`web/src/app/api/sui/vault/payroll/route.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/app/api/sui/vault/payroll/route.ts)
- Intent → tx builder (pay / vault_pay / swap): [`web/src/lib/sui/tx.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/lib/sui/tx.ts)
- Fixed signing dialog (Move abort → BSOD): [`web/src/system/Dialogs.tsx`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/system/Dialogs.tsx)
- Deployment ids (testnet): [`web/src/lib/sui/deployment.json`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/lib/sui/deployment.json)

**Why it's valid for Sui.** Real payments, on-chain: a published Move `AgentVault` package on testnet (packageId `0xc0bcd072…f34587`); **zkLogin login + Enoki-sponsored, gasless transactions verified end-to-end on-chain** (the sponsor paid gas, the sender only paid the transfer). Three advanced DeFi flows are real and gasless — **Programmable Payroll** (one PTB, atomic cap enforcement), **Rebalancer** and **DCA** (real SUI→SUSD swaps through our own deployed AMM pool, since DeepBook testnet is empty) — plus the safety story: an over-cap `agent_pay` **aborts on-chain** (abort code 2) and surfaces as a BSOD, so agent authority is enforced by Move, not by the UI.

**Feedback.** Public fullnode JSON-RPC being deprecated mid-cycle (forcing gRPC/GraphQL) was the biggest surprise and cost real time — clearer, louder migration signposting in the docs would help. Compiling Move without the CLI on Apple Silicon is painful (the emulated container can't git-fetch the framework); a first-class Dockerized build path would be great. Enoki's dual-feature key model (zkLogin + Sponsored both needing to be enabled, per network) is easy to get subtly wrong; a single "why is my sponsor call 4xx?" diagnostic would save hours. DeepBook testnet having zero liquidity meant we had to ship our own mock pool to demo swaps.

### 🟩 ENS — Best Use of ENSv2 (Sepolia)

**Where in the code**
- Registry/resolver/EAC contracts + roles: [`web/src/lib/ens/contracts.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/lib/ens/contracts.ts)
- On-chain minting, manifests, per-name resolvers, aliasing: [`web/src/lib/ens/onchain.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/lib/ens/onchain.ts)
- Per-browser device key + EIP-191 signed requests: [`web/src/lib/ens/device.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/lib/ens/device.ts) · [`web/src/lib/ens/auth.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/lib/ens/auth.ts)
- Mint / roles (EAC) / username routes: [`web/src/app/api/ens/mint/route.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/app/api/ens/mint/route.ts) · [`web/src/app/api/ens/roles/route.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/app/api/ens/roles/route.ts) · [`web/src/app/api/ens/username/route.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/app/api/ens/username/route.ts)
- Deployed contract addresses: [`web/src/lib/ens/deployment.json`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/lib/ens/deployment.json)

**Why it's valid for ENSv2.** ENS is the product, not a label. We use ENSv2 as a real filesystem on Sepolia: **subname registries as folders**, **Enhanced Access Control roles as sharing** (member/manager, EIP-191 device-key signed, enforced on-chain — verified 9/9 in a two-key sharing test), **per-name PermissionedResolvers** (creator holds root roles; server keeps only scoped setter roles then revokes root), **manifests in text records** (any resolver can rebuild the UI with no model call), **non-transferable usernames** at `users.suica.eth`, and **ENSv2 aliasing as symlinks** — moving an app re-mints it and the old name resolves to the new record, so old share links still open. The app index is read straight from `LabelRegistered` events.

**Feedback.** ENSv2 on Sepolia is a beta with "not final" addresses, so pinning contract versions and reading EAC state from logs took reverse-engineering; a stable ABI + an EAC "who has which role on this node" read helper would be huge. `eth_getLogs` block-range caps on free RPC tiers made the first full index scan (~40s cold) awkward — a documented events-indexing recipe for v2 registries would help. Overall EAC + subregistries mapped *beautifully* onto a filesystem — that mental model deserves to be a headline example.

### 🟨 Curvegrid — Best Digital Asset Dashboard

**Where in the code**
- Task Manager + My Computer (the dashboard): [`web/src/system/SystemApps.tsx`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/system/SystemApps.tsx)
- Live on-chain AgentVault + AgentCap state feed: [`web/src/app/api/sui/vault/state/route.ts`](https://github.com/fabianferno/ethglobal-tokyo-2026/blob/main/web/src/app/api/sui/vault/state/route.ts)

**Why it's valid.** Our **digital-asset dashboard** is the OS itself: **Task Manager** renders every agent as a process (wallet balance, spend rate, recent txs, "End Process" = revoke its AgentCap), and **My Computer** shows the live **AgentVault as a drive** with a real balance and a day-cap usage bar, reading real on-chain state (funds, fee_bps, per-tx/day caps, spent-today) every 15s. It's a treasury-and-permissions view of many agents at once — allocation, spend, and the actions that need a human — presented in a form anyone already understands.

**Note / honesty:** MultiBaas indexing of the ENSv2 Sepolia registry/resolver events (to power the EVM side of the dashboard) is designed and stubbed but **not yet wired** — the current dashboard reads Sui vault state directly over gRPC and the ENS index directly from Sepolia logs. If MultiBaas integration is required for this prize, treat this as in-progress rather than complete.

**Feedback.** The "digital asset dashboard" framing is a great fit for a multi-agent treasury; a MultiBaas path that spans both an EVM chain (our ENSv2 Sepolia events) and a non-EVM chain (our Sui vault state) in one dashboard would have let us unify the two halves — right now we bridge them in app code.
