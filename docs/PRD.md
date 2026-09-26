# AgentOS 99 — PRD

> Working title. A fully hallucinated, Windows‑99‑styled operating system where every app is an agent with an ENS name and a Sui wallet, and every UI is composed in real time by Jev.

ETHGlobal Tokyo 2026 · Tracks: **Sui DeFi & Payments** · **ENS (Best Use of ENSv2)** · **Curvegrid (Best Digital Asset Dashboard)**

---

## 1. One‑liner

Type anything into the Start menu — *"minesweeper but leverage futures"*, *"excel of fabianferno.eth's portfolio"*, *"split bills with friends"* — and a working, on‑chain agent app appears **instantly** as a chunky retro window, with its own ENS name and Sui wallet, that you can reuse, share and remix.

## 2. Why

- Crypto apps are a wall of unfamiliar UIs. Everyone already knows how Excel, Paint and Minesweeper work.
- Agents are becoming the way people use money on‑chain, but they have no *home*: no identity, no permissions model, no place to live next to each other.
- LLM‑generated UIs are slow (seconds) and unpredictable. We want UI that is **generated but instant**.

## 3. Core concepts

| Concept | Meaning |
|---|---|
| **App = Agent** | Every app is an agent: an ENS (v2) name + a Sui wallet + a manifest + a policy. The UI is disposable; the identity and money persist. |
| **Manifest** | ~1 KB of Jev answers + parsed params + roles + policy, stored in the agent's ENS text records. Anyone who resolves the name can rebuild the exact UI instantly — no model call. |
| **Folder = Workspace** | A parent ENS name (`team.tokyo.eth`). Apps inside are subnames. The folder holds a shared treasury and spend policy that its apps inherit. |
| **Shell × Function × Target** | Every prompt decomposes into a familiar Win99 app (**shell**), a crypto capability (**function**), whose data (**target**, e.g. an ENS name) and a **vibe**. 40 shells × 30 functions ≈ 1,200 apps from one classifier call. |
| **Data shapes** | Functions output one of 6 shapes (Table, TimeSeries, List, RiskyGrid, Gauge, Scene). Shells declare which shapes they render. Adapters connect them, so any compatible shell × function works without bespoke code. |
| **Publish / Use / Remix** | Published apps show up in everyone's Start‑menu search. Opening someone else's app gives you your role's view. "Save As…" forks it under your name. |

## 4. The real‑time UI pipeline (Jev only, no LLM on the critical path)

**Jev decides, code computes.** [Jev](https://typesafe.ai) (TypeSafe AI) is a "System One" model: it never generates text; it answers typed questions (`choice` ≤255 options, `score` 2–10 levels, `noul` yes/no) with calibrated probabilities in ~70–500 ms, for $0.042 / 1M input tokens. All questions in one call are answered in parallel and independently.

```
keystroke ─debounce 120ms─► /api/intent
                              ├─ Jev: ONE call, ~20 questions in parallel
                              │    shell (choice), fn (choice), vibe (choice), scene (choice),
                              │    palette (choice), readOnly (noul), recurring (noul),
                              │    risk (score), isNonsense (noul) …
                              ├─ parser (deterministic): ENS names, tokens, amounts,
                              │    leverage, schedule, percentages, member counts
                              └─ fallback: offline keyword classifier (same output shape)
                           ◄── IntentResult
client: calm‑UI state machine (challenger must win twice) ─► compose(shell, fn, params) ─► window
```

Rules (from Jev docs + Shapeshift):
1. Ask every question every time (speculative fan‑out); code decides which answers matter.
2. Never ask Jev to extract values, count, or do math — the parser does that.
3. Confidence thresholds live in code, not prompts. Low confidence → "Did you mean" chips.
4. `isNonsense` high → a real Win99 error dialog (*"Windows cannot find 'fridge.exe'"*) with suggestions.

**Start‑menu search** shows, live:
- **Best match / Published apps** — keyword shortlist of the ENS app index, then one `noul` per candidate ("does this app do what the user wants?") in the same Jev call.
- **Create new** — the top‑3 `shell × fn` combos with a live preview.

### Animation layer (non‑blocking)
1. **Instant:** Jev's `scene` choice selects one of ~20–40 hand‑built GSAP/SVG scenes (coins flowing, ticker tape, defrag blocks, liquidation explosion…).
2. **Optional upgrade:** an LLM writes a custom GSAP timeline in the background and cross‑fades it in when ready. The app is fully usable before and without it. It only touches a sandboxed SVG layer — never app logic or money.

## 5. Shells, functions, shapes

**Data shapes:** `Table` · `TimeSeries` · `List` · `RiskyGrid` · `Gauge` · `Scene`

**Shells (v1 in bold):** **Excel**, **Minesweeper**, **Paint**, **Weather**, **Notepad**, **Explorer** (generic fallback), Solitaire, Winamp, Calculator, Outlook, Pinball, MSN, Calendar

| Shell | Accepts | Mapping example |
|---|---|---|
| Excel | Table, TimeSeries | rows = holdings, `=PNL(B2)`, Chart Wizard |
| Minesweeper | RiskyGrid | cell = leverage × entry; mines = liquidation; number = nearby liq risk; flag = stop‑loss |
| Paint | Scene, Gauge | meme/stamp canvas with real numbers (roasts, NFT avatars) |
| Weather | Gauge | market mood: ☀️ calm … ⛈️ liquidation cascade |
| Notepad | List | trade journal from on‑chain history |
| Explorer | any | generic list/detail fallback |

**Functions:** portfolio, perps, dca, lp, yield, split, savings circle (tanomoshi), checkout, subscription, allowance, bounty, escrow, rsvp, pay‑per‑call, roast, alerts, loan guard, stake, club.

## 6. System apps (fixed OS code — never generated)

| App | Purpose | Track |
|---|---|---|
| **Signing dialog (UAC)** | Only place a transaction can be approved. Shows decoded tx + Jev risk badges + AgentCap check. | Safety (Sui) |
| **Task Manager** | Every agent as a process: wallet balance, spend/min, recent txs, End Process = revoke AgentCap. | Curvegrid dashboard |
| **My Computer** | Each agent wallet is a "drive"; usage bar = allocation. | Curvegrid dashboard |
| **Network Neighborhood** | Browse other people's published agents by ENS name. | ENS |
| **Control Panel** | Folder/agent policies: caps, allowed contracts, roles. | ENS EAC / Sui |
| **BSOD** | Shown when Move rejects an agent's out‑of‑policy call. | Demo beat |
| **Recycle Bin** | Revoke + burn subname. | ENS |

## 7. On‑chain design

### ENS v2 (Sepolia) — central, not cosmetic
- **Subname registry per user/folder:** `disha.eth` → `team.disha.eth` (folder) → `grouptab.team.disha.eth` (app/agent).
- **Agent identity:** ENSIP‑25/26 agent text records hold the manifest pointer, agent wallet addresses (incl. Sui coin type), avatar/icon.
- **Sharing = Enhanced Access Control roles:** owner / member / viewer roles on an app subname drive which view Jev composes.
- **Permissioned resolver:** only the owner (or the folder's policy) can update the manifest; the agent itself can update status records.
- **Expiring / revocable subnames:** time‑boxed apps (RSVP, event split); Recycle Bin = revoke.
- **Published app index:** registry events indexed (Curvegrid MultiBaas on Sepolia) → Start‑menu search.

### Sui — where the money moves
- **zkLogin** boot screen (Google → wallet, no seed phrase).
- **Sponsored transactions** — users and agents never hold SUI for gas.
- **`AgentVault<T>` Move package** — one generic contract behind every money app:
  - share tokens for depositors, withdraw any time;
  - `AgentCap` = the agent's permission slip (allowed calls, per‑tx / per‑day caps, token allowlist, expiry);
  - `fee_bps` to the app's creator.
- **PTBs** for atomic multi‑party settlement (Group Tab, Payroll, Tanomoshi).
- **DeepBook** for swaps/DCA/grid; Cetus/Momentum CLMM for Auto‑LP; Suilend/Navi/Scallop for Yield Router; Bluefin for perps (paper mode in demo).
- **Walrus** for receipts, generated animations and manifest blobs.

### Curvegrid
- MultiBaas indexes ENSv2 Sepolia registry/resolver events → app index + Task Manager feed.
- Task Manager + My Computer = the **digital asset dashboard** (treasury, per‑agent allocation, actions needed).

### Agent runtime
- Agent keys server‑side, bounded by `AgentCap` on‑chain.
- Per tick: Jev answers `action` (hold / rebalance / harvest / deleverage / exit / ask_owner), `volatility`, `anomaly`; code computes amounts; confidence gates autonomy.
- Every tx is **proposed** by an agent and **approved** in the fixed Signing dialog (or auto‑approved within owner‑set caps).

## 8. Demo script (~3 min)

1. Boot → zkLogin → Win99 desktop.
2. Start → `excel of fabianferno.eth portfolio` → spreadsheet of a real ENS‑resolved portfolio appears as you type.
3. Start → `paint but roast my portfolio` → meme with real numbers; "Send to…" shares `roast.disha.eth`.
4. Start → `minesweeper but leverage futures` → click a cell → Signing dialog → position opens; hit a mine → liquidation animation.
5. Start → `split bills with friends` → published `grouptab.disha.eth` is Best Match → teammate opens it on their laptop and gets the member view → agent settles in one sponsored PTB.
6. Task Manager: live flows across all agents (Curvegrid). A rogue agent exceeds cap → Move rejects → BSOD.

## 9. Milestones

| # | Scope | Status |
|---|---|---|
| M0 | Win99 UI kit, desktop, window manager, taskbar, Start menu | ✅ done |
| M1 | `/api/intent` (Jev + offline fallback), parser, live Start search + preview | ✅ done (Jev online path untested without key) |
| M2 | Shells v1: Excel, Minesweeper, Paint, Weather, Notepad, Explorer | ✅ done (mock data) |
| M3 | System apps: Signing dialog, Task Manager, My Computer, BSOD, error dialog | ✅ done (mock data) |
| M4 | Folders/workspaces, Save As → ENS name, Publish, local app index | ✅ done (localStorage, not on-chain) |
| M5 | ENSv2 Sepolia: subname registry, text‑record manifests, EAC roles | ⬜ |
| M6 | Sui: zkLogin, sponsored tx, `AgentVault` Move package, DeepBook DCA | ⬜ |
| M7 | Agent runtime + Jev tick loop; MultiBaas indexing | ⬜ |
| M8 | GSAP scene library (20+) + optional LLM animation upgrade | 🟡 7 scenes |

## 10. Risks / open questions

- **Jev API access** — launched Sept 15, 2026; offline classifier keeps the demo alive without a key.
- **Composition ceiling** — the "infinite apps" feel depends on shell/scene/function breadth. Prioritise 6 great shells over 20 weak ones.
- **Sui testnet liquidity** — many DeFi protocols are mainnet‑only. Plan: DeepBook testnet + our own mock pool; perps in paper mode.
- **MultiBaas is EVM** — Sui data comes from Sui RPC/GraphQL; MultiBaas covers the ENS/Sepolia side.
- **Branding** — "Windows 99" is a parody UI kit; don't ship Microsoft logos.

## 11. Out of scope (hackathon)
Real file system, multi‑user realtime cursors, mobile layout, mainnet real‑money perps.
