# Suica OS — PRD

> A fully hallucinated, Windows‑99‑styled operating system where every app is an agent with an ENS name and a Sui wallet, and every UI is composed in real time by Jev.

ETHGlobal Tokyo 2026 · Tracks: **Sui DeFi & Payments** · **ENS (Best Use of ENSv2)** · **Curvegrid (Best Digital Asset Dashboard)**

---

## 1. One‑liner

Type anything into the Start menu — *"minesweeper but leverage futures"*, *"excel of fabianferno.eth's portfolio"*, *"split bills with friends"* — and a working, on‑chain agent app appears **instantly** as a chunky retro window, with its own ENS name and Sui wallet, that you can reuse, share and remix.

**Positioning: apps are places, not programs.** *"Making an app is instant. The name is where everyone meets."* Anyone can make a blank app in a second, the same way anyone can make a blank Google Doc. You open `tab.shibuya-cafe.suica.eth` because that's where your friends, the tab and the money already are. Search ranks by relevance only (for now).

**Pitch lines:** "Clippy was supposed to have a calibrated brain. Office shipped without it. We gave it one, plus a name and a wallet." · "Every game someone asks for becomes a shell everyone else can use instantly."

## 2. Why

**The thesis.** We're moving towards a future where we don't need apps for anything: agents do the work. But we still need user interfaces, to see what our agents did, to understand it, and to approve or refuse it. So interfaces will be **generated on demand**: changing in real time, and personal to whoever is using them. No frontend to build, no app to install. Suica OS is an experiment in that idea: **a fully hallucinated operating system**, where everything on screen is composed in real time by Jev.

**The question it asks you:** *imagine a search bar where anything you type becomes an app. What would you make?*

- Crypto apps are a wall of unfamiliar UIs. Everyone already knows how Excel, Paint and Minesweeper work.
- Agents are becoming the way people use money on‑chain, but they have no *home*: no identity, no permissions model, no place to live next to each other.
- LLM‑generated UIs are slow (seconds) and unpredictable. We want UI that is **generated but instant**.
- **ENS as the file system.** A filesystem is just names, folders, permissions and links. ENSv2 has all four: subnames, per-folder registries, Enhanced Access Control roles, and aliases. So `suica.eth` *is* the disk: folders are registries, sharing is EAC roles, and moving an app into a folder turns its old name into an ENSv2 alias of the new one, i.e. a symlink, so old share links keep working.

### First-run onboarding (there is no landing page)
Right after boot, a Windows 98-style **Welcome to Suica OS** dialog is the landing page (`web/src/os/Welcome.tsx`). Topics down the left:
1. **What is this?** The thesis above, in four sentences.
2. **Type anything.** Eight real prompts. Each "Try it" opens Start with the prompt already typed.
3. **Names are files.** The `suica.eth` tree, sharing = EAC roles, moving = alias (symlink).
4. **Agents & money.** zkLogin, sponsored gas, the fixed signing dialog, and Tappy acting within caps, down to the BSOD.
5. **How it works.** Jev's typed questions → shell × function × target → real data → generated shells → Sui.

It shows once per browser (with a "Show this each time Suica OS starts" box), and Tappy's greeting waits until it closes. It reopens from Start search ("what is this", "how does this work", "tour").

## 3. Core concepts

| Concept | Meaning |
|---|---|
| **App = Agent** | Every app is an agent: an ENS (v2) name + a Sui wallet + a manifest + a policy. The UI is disposable; the identity and money persist. |
| **Manifest** | ~1 KB of Jev answers + parsed params + roles + policy, stored in the agent's ENS text records. Anyone who resolves the name can rebuild the exact UI instantly — no model call. |
| **Folder = Workspace** | A parent ENS name (`team.suica.eth`). Apps inside are subnames. The folder holds a shared treasury and spend policy that its apps inherit. |
| **Shell × Function × Target** | Every prompt decomposes into a familiar Win99 app (**shell**), a crypto capability (**function**), whose data (**target**, e.g. an ENS name) and a **vibe**. 40 shells × 30 functions ≈ 1,200 apps from one classifier call. |
| **Data shapes** | Functions output one of 6 shapes (Table, TimeSeries, List, RiskyGrid, Gauge, Scene). Shells declare which shapes they render. Adapters connect them, so any compatible shell × function works without bespoke code. |
| **The assistant (Tappy)** | One Clippy-style agent for the whole OS. It's an original character (an IC card with eyes), not Clippy and not the Suica penguin. It speaks only in balloons with buttons, and every line is a template filled with real numbers. It stays quiet unless a code-side threshold is met: Lumière's calibrated "only interrupt when sure and worth it". Autonomy: within the owner's cap it acts, then tells you. Over the cap it asks through the fixed Signing dialog. If an attempt goes over the cap anyway, Move aborts and the BSOD appears. |
| **Generated shells** | When a prompt names a program we don't have ("tetris but my portfolio"), an LLM writes that SHELL once, in the background. The shell is a renderer for data shapes, so it then works with every function × target. It runs as an untrusted guest: a sandboxed iframe with no network, data pushed in, and propose-only. It's stored on Walrus with a pointer and sha256 at `<label>.shells.suica.eth`. The first installer owns the name. |
| **Publish / Use / Remix** | Published apps show up in everyone's Start‑menu search. Opening someone else's app gives you your role's view. "Save As…" forks it under your name. |

## 4. The real‑time UI pipeline (Jev on the critical path; LLM only writes new shells in the background)

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

### Generated shells (non‑blocking, decided 2026‑09‑26)
"Anything you ask for must be possible." Jev still composes every app instantly from the built-in shells. When the prompt names a program we don't have:
1. **Instant:** the nearest built-in shell opens with real data ("Excel compatibility mode").
2. **Tray:** a classic *"Setup is installing TETRIS.EXE…"* dialog shows the stages. An LLM (Vercel AI Gateway, `anthropic/claude-sonnet-5` first, falling back to `openai/gpt-5`) writes the shell. It takes about 2 minutes.
3. **Gate:** a static check (no network, storage, eval or parent access; must call `suica.onData` and `suica.ready`). Then an in-browser smoke test runs the shell in the same sandbox with real data. It must call `ready()`, draw something and throw no errors. It gets one retry, with the error fed back. Otherwise: *"Setup was unable to install…"*.
4. **Publish:** the HTML goes to Walrus, and `suica.shell` = `{blobId, sha256, …}` is written to `<label>.shells.suica.eth`. Anyone can load it later; the hash is checked before it runs.
5. **Ask, never swap:** Tappy says *"TETRIS.EXE is installed! Open your app in it?"* The UI never changes under the person without that.

The code is in `web/src/lib/genshell/*`, `web/src/app/api/shells`, `web/src/shells/GeneratedShell.tsx` and `web/src/assistant/InstallTray.tsx`.

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
- **Names for apps, folders, and one username per user.** The OS owns `suica.eth`:
  - app/agent: `grouptab.suica.eth`
  - folder/workspace: `team.suica.eth`, with its own subregistry
  - app in a folder: `grouptab.team.suica.eth`
  - username: `alice.users.suica.eth` → the user's browser device key (claimed at log-on, owned by that key, non-transferable). Folders are shared with a username.
- **First come, first served** under `suica.eth`; a folder owner controls everything inside their folder, so collisions only happen at the top level.
- **Agent identity:** ENSIP‑25/26 agent text records hold the manifest pointer, agent wallet addresses (incl. Sui coin type), avatar/icon.
- **Sharing = Enhanced Access Control roles:** owner / member / viewer roles on an app subname drive which view Jev composes.
- **Permissioned resolver:** only the owner (or the folder's policy) can update the manifest; the agent itself can update status records.
- **Expiring / revocable subnames:** time‑boxed apps (RSVP, event split); Recycle Bin = revoke.
- **Published app index:** read straight from our registries' `LabelRegistered` events + `suica.published` text records → Start‑menu search and Network Neighborhood.

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

### Agent runtime: the assistant
- **One OS-wide assistant (Tappy)** is the visible face of every app's agent (`web/src/assistant/*`). App windows, installs and crashes feed its triggers. Each trigger is gated by a threshold in code: for example, a loss alert needs more than $500 and more than -25% over 30 days. It never generates text.
- **Autonomy in three levels:**
  1. Within the owner's cap, it acts and then tells you ("I settled Shibuya Café Tab…").
  2. Over the cap, it asks, and the fixed Signing dialog opens.
  3. If it tries anyway, Move aborts and the BSOD appears, with the assistant looking guilty.
- **The cap is set from a balloon:** "Want me to handle this tab? ○ Up to ¥5,000/day ○ Always ask me". It mirrors the on-chain AgentCap.
- **Real Sui auto-execution** (no dialog, AgentCap-gated `vault_pay`) is owned by the Sui lane (`autoExecuteSui`). Until it lands, real transactions go through the dialog (level 2) and only paper mode auto-acts.
- **Next:** Jev tick questions (`action`, `anomaly`, `ask_owner`) replace the code thresholds as the confidence source.

## 8. Demo script (~3 min: the thesis, then one place)

1. **The thesis** (20s): boot, and the *Welcome to Suica OS* dialog is on screen. Say it: *"This is a fully hallucinated operating system. Nothing here was built as an app; every window is composed in real time by Jev. Agents are going to do the work, but we still need interfaces to see and steer them. So what if the interface was generated, live, and personal? Imagine a search bar where anything you type becomes an app. What would you make?"* Click **Try it → tetris but my portfolio**: it opens instantly in compatibility mode while *Setup is installing TETRIS.EXE* runs in the tray.
2. **Anything you type** (30s), every window real data:
   - `paint but roast vitalik.eth`: "AIRDROP LANDFILL", $644K of unsellable airdrops.
   - `doom but I'm shooting my losses`: losing bags are the demons.
   - `paint app with eth chart on it`: a hand-drawn live ETH chart.
   - `compare vitalik.eth and nick.eth` / `gas tracker` (the Curvegrid dashboard, real data).
3. **Names are files** (30s): open Network Neighborhood (the `suica.eth` "disk"). Drag an app into the `shibuya-cafe` folder: it gets `….shibuya-cafe.suica.eth`, and its old name becomes an **ENSv2 alias**, a symlink, so the old share link still opens it. Share the folder with a teammate: that's an EAC role grant, live on Sepolia.
4. **The place** (30s): `split bills with friends` shows the published tab as Best Match. The teammate opens the same name on their laptop and joins. *"Making an app is instant. The name is where everyone meets."*
5. **The agent** (40s): Tappy offers *"Want me to handle this tab? Up to ¥5,000/day"*. OK, and it settles in one sponsored Sui PTB. `send 5 USDC to kenji.eth` goes through the fixed signing dialog. Task Manager shows the agents as processes with real balances.
6. **Mid-demo:** TETRIS.EXE finishes installing, and Tappy asks *"Open your portfolio in it?"* That's a program nobody wrote, now instant for everyone at `tetris.shells.suica.eth`.
7. **Safety + close** (20s): an agent tries to overspend, Move aborts, BSOD. Tappy: *"That was me. Sorry. The chain said no, and no funds moved."* Close: *"We don't need apps anymore. We need interfaces that show up when we ask. Suica OS: every app is hallucinated, every name is on ENS, every dollar moves on Sui."*

## 9. Milestones

| # | Scope | Status |
|---|---|---|
| M0 | Win99 UI kit, desktop, window manager, taskbar, Start menu | ✅ done |
| M1 | `/api/intent` (Jev + offline fallback), parser, live Start search + preview | ✅ done (Jev online path untested without key) |
| M2 | Shells v1: Excel, Minesweeper, Paint, Weather, Notepad, Explorer | ✅ done (mock data) |
| M3 | System apps: Signing dialog, Task Manager, My Computer, BSOD, error dialog | ✅ done (mock data) |
| M4 | Folders/workspaces, Save As → ENS name, Publish, local app index | ✅ done (localStorage, not on-chain) |
| M5 | ENSv2 Sepolia: subname registry, text‑record manifests, EAC roles | 🟡 suica.eth registered; apps/folders minted with on-chain manifests; index from chain. EAC sharing roles + user-owned names next |
| M6 | Sui: zkLogin, sponsored tx, `AgentVault` Move package, DeepBook DCA | ⬜ |
| M7 | Agent runtime + Jev tick loop; MultiBaas indexing | ⬜ |
| M8 | GSAP scene library (20+) + optional LLM animation upgrade | 🟡 7 scenes |
| M9 | Real read-only data for any ENS name (`/api/portfolio`) → portfolio, roast, Doom losses | ✅ done (mainnet ENS + Ethplorer) |
| M10 | Generated shells: tray install, sandbox, smoke test, Walrus + `shells.suica.eth` | ✅ verified end to end: SNAKE.EXE generated (~2 min via `openai/gpt-5`, because the gateway key's free tier blocks Anthropic models), smoke-tested, then Walrus blob + `snake.shells.suica.eth` (sha256 matches) |
| M11 | Assistant (Tappy): greeting, loss alert → Doom, install lifecycle, Group Tab cap + auto-settle (paper), BSOD apology | ✅ built; real-Sui auto-settle waits on `autoExecuteSui` |

## 10. Risks / open questions

- **Jev API access** — launched Sept 15, 2026; offline classifier keeps the demo alive without a key.
- **Composition ceiling** — the "infinite apps" feel depends on shell/scene/function breadth. Prioritise 6 great shells over 20 weak ones.
- **Sui testnet liquidity** — many DeFi protocols are mainnet‑only. Plan: DeepBook testnet + our own mock pool; perps in paper mode.
- **MultiBaas is EVM** — Sui data comes from Sui RPC/GraphQL; MultiBaas covers the ENS/Sepolia side.
- **Branding** — "Windows 99" is a parody UI kit; don't ship Microsoft logos. The assistant is an original character, not Clippy; Doom shows as a parody title.
- **Generated shell quality**: some generations misread data (the first TETRIS read token amounts as dollars; the prompt now spells out `fmt`). Generation takes ~2 min, so the demo's montage shells are pre-installed and only one install runs live.
- **Generation cost/tier**: Anthropic models on the AI Gateway need paid credits. Until then the fallback chain uses `openai/gpt-5` (`GENSHELL_MODELS` env).

## 11. Out of scope (hackathon)
Real file system, multi‑user realtime cursors, mobile layout, mainnet real‑money perps.
