# Handoff — where Suica OS stands (2026-09-26)

Read this first when picking the project up on a new machine. The product spec is `docs/PRD.md`; the code map is `web/README.md`.

## Pick up on a new machine

```bash
git clone git@github.com:fabianferno/ethglobal-tokyo-2026.git && cd ethglobal-tokyo-2026/web
pnpm install
# copy the real secrets from the old machine (never commit this file):
#   scp <old-host>:~/ethglobal-tokyo-2026/web/.env.local web/.env.local
pnpm dev            # http://localhost:3000 (must be exactly this origin for Google OAuth)
```

Without `.env.local` the app still runs: Jev falls back to the offline keyword classifier, the ENS index falls back to the demo list, and mints show as "local only".

## Done

| Area | State |
|---|---|
| Win99 UI kit, desktop, windows, Start menu, taskbar, BSOD | Done (`web/src/styles/win99.css`, `web/src/components/win99/*`, `web/src/os/*`) |
| Jev intent → SHELL × FN × TARGET × VIBE, anti-flicker gate, live preview | Done (`web/src/lib/intent/*`, `web/src/os/StartMenu.tsx`). Gateway key not yet tested live. |
| Shells: Excel, Minesweeper, Paint, Weather, Notepad, Explorer + **Hologram** (retro 3D, Orion) + **Doom** (positions→enemies, Orion, prototype); ~20 functions; 7 GSAP scenes | Done. Mock by default (`web/src/lib/chain/mock.ts`); Portfolio uses **real Sui balances** when signed in; My Computer shows the **real AgentVault**. Notepad now honors the named shell (topCombos fix, Orion). |
| ENSv2 Sepolia: `suica.eth` registered, own UserRegistry + PermissionedResolver | Done (`web/src/lib/ens/deployment.json`, `pnpm ens:setup`) |
| Apps/folders minted as subnames; full manifest in text record `suica.manifest`; `suica.published`; index read from `LabelRegistered` events | Done (`web/src/lib/ens/onchain.ts`, `/api/ens/{mint,index,publish}`, `pnpm ens:seed`) |
| Sui SDKs installed (`@mysten/sui` 2.33, `@mysten/enoki` 1.2) | Installed |
| Sui zkLogin + sponsored tx + Group Tab settle-up (steps 1–6 below) | **Built** (`web/src/lib/sui/*`, `/api/sui/*`, `/api/ens/members`). Static-verified (tsc/eslint) + handler-verified; live E2E still blocked on the two pending user actions. |

On-chain: 3 folders (shibuya-cafe, ethglobal, tokyo-hackers) + 12 published apps under suica.eth. Test leftovers: `qa-lab.suica.eth`, `weather-2.suica.eth`, `weather-2.qa-lab.suica.eth`.

## Wallets and keys (values only in `web/.env.local`)

| What | Address / id | Notes |
|---|---|---|
| Sepolia server wallet (owns suica.eth, mints everything) | `0xC9Be7046Ed1DDb8E5ea30bB3Af12FbF56Cd717F0` | ~0.98 ETH left |
| Sui testnet server wallet | `0xbf7762e87fc8ffd8f6f0cd06c24b5b4023ad9081c448b8722dba5127dadc54bb` | **Needs funding** (faucet.sui.io; the scripted faucet is rate-limited) |
| Enoki app | `ENOKI_PRIVATE_KEY` | zkLogin + sponsored txs, testnet/devnet. Verified with `getApp()`. |
| Google OAuth client | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = `253257974343-n25bcke97cm02su5apq3eppmlb8ejg65.apps.googleusercontent.com` | origin + redirect `http://localhost:3000`. Client secret not needed. |

## Pending user actions
1. **Enoki portal (portal.enoki.mystenlabs.com):** (a) add Auth Provider → Google with the client id above; (b) add allowed origin `http://localhost:3000` (later the Vercel domain); (c) **the `ENOKI_PRIVATE_KEY` must have BOTH zkLogin AND Sponsored Transactions features enabled AND Testnet enabled** — we route both through the one server key, so if either feature scope or the network is off, nonce/zkp or sponsor calls 4xx (verified against Enoki OpenAPI + SDK source, 2026-09-26). `getApp()` still showed no providers/origins.
2. **Fund the Sui server wallet** with testnet SUI (faucet.sui.io), and optionally Circle testnet USDC (faucet.circle.com → Sui testnet) so the server can top up users.
3. Add `AI_GATEWAY_API_KEY` to test Jev live.

### ENSv2 depth (built + verified on Sepolia, 2026-09-26)
- **Folder sharing (EAC):** each browser has an EVM "device key" (`src/lib/ens/device.ts`, localStorage, holds no funds). Mint/share requests are EIP-191 signed (`src/lib/ens/auth.ts`, 5-min window, bound to action + name). Folder creator gets `REGISTRAR|RENEW` + their admin roles in the folder UserRegistry's `initialize`. `/api/ens/roles` GET lists roles (EACRolesChanged + `hasRootRoles`), POST grants/revokes member/manager (signer must be a manager). Minting into a folder → 403 "Access denied" unless the signer holds `ROLE_REGISTRAR`. FolderView shows live roles + Share form; `/?open=<folder>` pins a shared folder.
- **Per-name PermissionedResolver:** every new app/folder deploys its own resolver proxy (records written in `initialize`). The creator's device key holds root `ALL_ROLES`; the server keeps only argument-scoped setter roles via `grantSetterRoles` (`setText suica.members`, `setText suica.published`, `setAddress 784`) and then revokes its own root roles. Verified: server can't rewrite `suica.manifest`, can still write members. Names minted before this keep the shared resolver.
- **Usernames:** every browser auto-claims `<handle>.users.suica.eth` at log-on (`claimUsername` in `store.ts` → `POST /api/ens/username`, signed with the device key; `GET ?address=` looks one up). `users.suica.eth` is its own UserRegistry (label `users` is reserved at the root and hidden from the index). Each username has its own PermissionedResolver with `addr(60)` = the device key; the token is owned by the device key and non-transferable (minted without `ROLE_CAN_TRANSFER_ADMIN`; verified: `unsafeTransfer` reverts `TransferDisallowed`). Idempotent per key; clashes get `-2`. The Share box takes a bare username; the roles list shows usernames. The username belongs to the browser key, so logging in under a different handle in the same browser keeps the first name.
- **Sui vault pointer:** `setSuiVault(ens, vaultId)` writes `addr(784)` (used by Apollo's `/api/sui/vault/create`). Read it with `getEnsAddress({ coinType: 784n })`; calling the resolver's `addr()` directly reverts. Risk: the server keeps its scoped `setAddress(784)` role forever and can't drop it per name (EAC needs the role's admin to revoke, which the server gave up at seal), so a leaked server key could repoint vaults.
- **Record aliasing:** moving an on-chain app into/out of a folder links the old name to the new record (`linkToNode` on the new resolver + `setResolver` on the old name), so old share links resolve live data. Only the creator (root roles on the old resolver) can alias. Every record carries `suica.ens` = its canonical name; the index marks `aliasOf` and the client maps old → new for `?open=`.
- RPCs: `SEPOLIA_RPC_URL` (Alchemy, set in `.env.local`) handles calls + txs with multicall batching. Alchemy's free tier caps `eth_getLogs` at 10 blocks, so the full-range first scan uses `SEPOLIA_LOGS_RPC_URL` (default publicnode). Log scans are incremental (last scanned block cached per registry+event), so later refreshes fit Alchemy's limit. `listAll` is single-flight and serves the last good index on error. Index: ~40s cold after a server restart, ~5s incremental, cached 15s.
- A move refused on-chain (403) puts the app back on the desktop and shows "Access denied".
- QA leftovers on-chain (all unpublished): folders `qa-share-zryl`, `qa-rt-7cq8`, `qa-ui`, `qa-r2-ih14`, `qa-f-z5rh`, `qa-bob`, `qa-uf-s5c8`, `qa-carol-team`, `users-2` (reserved-name test); usernames `qa-alice-s5c8`, `qa-alice-s5c8-2`, `qa-carol`; apps `qa-app-zryl`, `qa-app2-zryl`, `x.qa-rt-7cq8`, `qa-pub-ih14` (+ moved copy in `qa-r2-ih14`), `qa-tab-z5rh` (+ moved copy in `qa-f-z5rh`).
- **Known bug (not fixed):** `buildBundle` in `web/src/lib/compose/compose.ts` crashes the whole OS if a manifest's `fn` isn't in `FUNCTIONS`. Manifests come from chain, so a published app with a bad `fn` crashes anyone who opens it. Validate `fn`/`shell` in `fromStored` or guard `buildBundle`.

## Order of work (user-chosen): 1 → 3 → 2
1. **ENS folder sharing via EAC** — done (see above).
3. **Sui** — designed, in progress (see below).
2. **Deploy to Vercel** — after 1 and 3. Add auth + rate limit on `/api/ens/mint` first (it's unauthenticated and spends server gas).

### 1. Folder sharing (ENSv2 EAC) — design
- EAC root resource id is **0** (verified from `EACRolesChanged` logs). Server holds `ALL_ROLES` at resource 0 on the root registry; names get `OWNER_ROLES` at their resource.
- Identity: a browser-generated EVM "device key" per user (localStorage), alongside the zkLogin Sui address. Mint/share requests are EIP-191-signed + timestamped; the server recovers the signer.
- Folder creator → manager on the folder registry: `grantRootRoles(REGISTRAR|RENEW | admin(REGISTRAR))`. Member = `grantRootRoles(REGISTRAR|RENEW)`. Revoke = `revokeRootRoles`. Viewer = text record `suica.viewers`.
- Share dialog on folders (target: 0x address or ENS name resolved on Sepolia). FolderView reads real roles from `EACRolesChanged` logs. Minting into a folder requires `hasRootRoles(ROLE.REGISTRAR, signer)` else 403 → "Access denied" dialog.
- Helpers already exist in `web/src/lib/ens/contracts.ts` (`ROLE`, `admin()`, registry ABI with grant/revoke/hasRootRoles).

### 3. Sui — agreed design
- **Log-on:** Enoki zkLogin with Google. The private Enoki key stays server-side, so zkLogin is proxied through our API routes (not EnokiFlow in the browser).
- **Gas:** Enoki sponsored transactions — users never hold SUI.
- **Each app's "Sui wallet" = an `AgentVault<T>` shared object** (Move), with an `AgentCap` (per-tx/per-day caps, allowed recipients, expiry) and `fee_bps` to the creator. The vault id goes into the app's ENS record under Sui coin type 784, so `x.suica.eth` resolves to its Sui vault. A rogue agent over its cap → Move abort → real BSOD.
- **Move package: WRITTEN + COMPILES** (`web/move/suica_vault/`: `Move.toml`, `sources/vault.move`, committed `compiled.json`). Functions: `create_vault<T>`, `deposit`, `withdraw` (owner), `agent_pay` (capped, aborts on violation → BSOD), `revoke`, view fns. Build without a local Sui CLI: `pnpm sui:build` compiles in the `mysten/sui-tools:testnet` Docker image. **Gotcha solved:** the emulated amd64 container can't git-fetch github, so the framework is a LOCAL sparse clone (`move/.sui`, auto-created by the build script, gitignored) referenced via `[dependencies] Sui = { local = ... }`.
- **Publish: DONE (2026-09-26).** `pnpm sui:publish` published `suica_vault` to testnet. `packageId = 0xc0bcd0726fff2d2d480e44d24aabe334a2db30c5795236179a44fec6b0f34587`, UpgradeCap `0x57b44cb1b0191207dc3caa6a2b91599a2d9ba5be493ea03d44274307ca84a19a` (in `web/src/lib/sui/deployment.json`; explorer: suiscan.xyz/testnet/object/<packageId>). Server wallet funded via `pnpm sui:faucet` (the public faucet blocks datacenter IPs — the user funded it from their browser). NOTE: the gRPC execute result doesn't surface objectChanges, so the publish script recovers the packageId from the created `UpgradeCap`.
- **Contract validated on-chain: `pnpm sui:smoke`** drives the live package with the server keypair — create_vault ✓, deposit ✓, `agent_pay` within cap ✓, `agent_pay` over cap → **`MoveAbort abort code: 2` (EOverTxCap)** ✓. The Move abort surfaces during `tx.build()`'s client-side resolution (throws before execute), so the sponsor route will naturally reject an over-cap `vault_pay` with a `MoveAbort … abort code: N` message → detect that in the Signing dialog → BSOD. Abort codes: 0 ENotAuthorized, 1 EExpired, 2 EOverTxCap, 3 EOverDayCap, 4 ERecipientNotAllowed, 5 ENotOwner, 6 EBadFee.
- **Live vault demo (server-signed, testable now — no Enoki needed):** a funded demo vault (`demoVault`/`demoCap` in `deployment.json`, per_tx 0.02 SUI, funds 0.05 SUI) drives two Task Manager → Options actions: **"Send agent payment (0.01 SUI)"** → `POST /api/sui/vault/pay` = real within-cap `agent_pay` (moves real SUI, success balloon); **"Simulate rogue agent"** → `POST /api/sui/rogue` = over-cap `agent_pay` whose real Move abort (code 2) drives the **BSOD**. Both verified via curl.
- **`vault_pay` sponsored rails: code-complete.** `SuiIntent` now has a `vault_pay` variant (`shapes.ts`); `buildIntentTx`/`allowedTargets` (`tx.ts`) build the `agent_pay` moveCall; the sponsor route accepts it + passes `allowedMoveCallTargets`; and the **Signing dialog maps a Move abort (over-cap/expired/etc.) to a BSOD** in both the sponsor-on-open and execute-on-approve paths (`Dialogs.tsx` `moveAbort()` + `VAULT_ABORTS`). Live sponsored test needs Enoki; the abort→BSOD is already proven via the rogue route (same moveCall).
- **Curvegrid dashboard — real vault data (done, testable now):** `GET /api/sui/vault/state` reads the deployed vault + cap on-chain (funds, fee_bps, per-tx/day caps, spent_today); **My Computer shows a live "AgentVault (C:)" drive** with real balance + a day-cap usage bar (`useVaultState` in `SystemApps.tsx`), polling every 15s. Verified: funds/fee/caps/spent all real from Sui.
- **ENS × Sui resolution: DONE.** `POST /api/sui/vault/create {ens}` creates an `AgentVault<SUI>` (server-signed; the AgentCap is the agent runtime's, per PRD §7), recovers the vault id from the AgentCap, and writes it into the app's ENS record at Sui coin type 784 via `setSuiVault` (owned by session `05`, in `lib/ens/onchain.ts`). `GET /api/sui/vault/of?ens=` resolves it back via `getEnsAddress(coinType 784n)`. **Verified end-to-end:** `grouptab.suica.eth` → vault `0x5fa116c2…85ba`. Security: the server writes 784 once per app at create; `05` will drop the server's per-name `setAddress(784)` role after the first write.
- **Remaining:** a UI surface to create/show an app's vault (deferred — AppFrame is churning under 4 concurrent sessions; add a File-menu "Create Sui wallet" + show the resolved vault in About once it settles). The user-owned *sponsored* create (vs the current server-signed) is Enoki-gated.
- **Lanes (4 sessions):** me = Sui (`lib/sui`,`api/sui`,`move`) + Signing dialog + `api/ens/members`+`getMembers`/`addMember`. `05` = rest of `lib/ens`/`api/ens` (minting/roles/records/auth/device). Orion = Jev/intent + compose + Hologram/Doom shells. `3a` = assistant + LLM-gen shells + portfolio-by-ENS (`lib/portfolio/live.ts`, wired into my `useLiveBundle`).
- **First real flow: Group Tab settle-up** — one sponsored PTB paying each member their share. Members "Join tab", which writes their Sui address into the app's ENS text record (e.g. `suica.members`); settle-up reads recipients from ENS.
- **Real balances** in the Portfolio app for the logged-in user (and vaults) — also serves the Curvegrid track.
- **Stretch:** DeepBook DCA (testnet). Suilend/Cetus/Bluefin stay mock ("paper mode").
- Idea: "Charge your Suica" top-up (server sends a little USDC to new users) and a tap-to-pay animation for `checkout.shibuya-cafe.suica.eth`.

### Sui — implementation status (built 2026-09-26)
All six steps below are implemented. **Deviation from the original plan:** all tx-building, simulation and gRPC live server-side (`/api/sui/sponsor` takes the `sui` intent + sender, not pre-built kind bytes) to avoid gRPC-web CORS from the browser; the browser only signs the sponsored bytes and assembles the zkLogin signature. Rule of thumb in the UI: **guest login = paper mode everywhere; Google/zkLogin = real Sui.** The Signing dialog sponsors + simulates a `tx.sui` intent on open (real balance changes) and executes on Approve.
- Files: `web/src/lib/sui/{config,server,tx,session}.ts`; routes `web/src/app/api/sui/{zklogin/nonce,zklogin/zkp,sponsor,execute,charge,balances}/route.ts` + `web/src/app/api/ens/members/route.ts`; UI in `OS.tsx` (login), `Dialogs.tsx` (SignDialog), `StartMenu.tsx` (address + ⚡Charge), `AppFrame.tsx` (Group Tab Join/Settle), `store.ts` (suiAddress, sign-result plumbing, chargeSuica), `shapes.ts` (`SuiIntent`).
- **Portfolio real balances: done.** `ShellView` uses a `useLiveBundle` hook (`web/src/shells/AppFrame.tsx`) that renders the instant mock bundle, then for the logged-in user's OWN portfolio (`fn==="portfolio"` && `target===owner` && signed in) swaps in real Sui balances via `/api/sui/balances` (`enhancePortfolioBundle` in `web/src/lib/sui/portfolio.ts`). Guest/preview keep the mock. Shells stay generic (same shapes).
- **Status check:** `pnpm sui:check` prints the Enoki app config (providers/origins) + server-wallet balances. As of 2026-09-26 it shows no Enoki providers/origins and an empty server wallet (both pending user actions).
- **Verified API facts / env-loading gotchas:** to run route handlers under `tsx` outside Next, set `NODE_OPTIONS=--conditions=react-server` (so `server-only` resolves to a no-op) and `process.loadEnvFile(".env.local")`. Enoki `apiKey` = `ENOKI_PRIVATE_KEY`. `createZkLoginZkp` (not `createZkLogin`). `SuiGrpcClient({network, baseUrl})`. `coinWithBalance({type?, balance, useGasCoin})` via `tx.add(...)`. `getZkLoginSignature({inputs, maxEpoch, userSignature})`.

The original step list, for reference:
1. `web/src/lib/sui/config.ts` (network, gRPC URL, coin types, explorer links) and `web/src/lib/sui/server.ts` (server-only EnokiClient + server keypair).
2. Routes:
   - `POST /api/sui/zklogin/nonce` `{ephemeralPublicKey}` → `enoki.createZkLoginNonce` (rebuild the key with `new Ed25519PublicKey(b64)`)
   - `POST /api/sui/zklogin/zkp` `{jwt, ephemeralPublicKey, randomness, maxEpoch}` → `createZkLoginZkp` + `getZkLogin` (address, salt)
   - `POST /api/sui/sponsor` `{sender, transactionKindBytes, allowedAddresses}` → `createSponsoredTransaction` → `{bytes, digest}`
   - `POST /api/sui/execute` `{digest, signature}` → `executeSponsoredTransaction`
   - `POST /api/sui/charge` `{address}` — server tops up a new user (rate-limited)
3. Browser: ephemeral Ed25519 key in sessionStorage → redirect to Google (`response_type=id_token`, `redirect_uri=location.origin`, `nonce`) → on return parse `#id_token` → zkp → session `{address, jwt, zkp, maxEpoch}`. Sign: `ephemeral.signTransaction(bytes)` then `getZkLoginSignature({inputs: {...zkp, addressSeed}, maxEpoch, userSignature})`.
4. `TxProposal` gets an optional serializable `sui` intent (e.g. `{kind: "pay", coinType, transfers: [{to, amount}]}`). The SignDialog builds it (`onlyTransactionKind: true`), sponsors it, **simulates it and shows real balance changes**, then Approve signs + executes. With sponsorship, pay from the user's coins via `coinWithBalance({type, balance, useGasCoin: false})` — never from `tx.gas` (that's the sponsor's).
5. Login screen: "Log on with Google" (keep guest/offline mode). Store the Sui address in OS state; show it in the Start menu.
6. Group Tab (`split` in `web/src/lib/compose/functions.ts`): Join + Settle up as above. Portfolio: real balances when target = me.

### Verified API facts (Sui)
- **Public fullnode JSON-RPC is deprecated** ("Method not found … migrate to gRPC or GraphQL"). Use `SuiGrpcClient({network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443"})` (works from Node, ~200ms) or GraphQL `https://graphql.testnet.sui.io/graphql`.
- gRPC client has `listBalances`, `getCoinMetadata`, `simulateTransaction` (include `balanceChanges`), `executeTransaction`, `waitForTransaction`, `verifyZkLoginSignature`.
- Circle testnet USDC on Sui: `0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC` (6 decimals, verified via `getCoinMetadata`).
- Enoki `createSponsoredTransaction` (private key) takes `sender` + optional `allowedAddresses` / `allowedMoveCallTargets`.

## Known caveats
- **Don't `pnpm install` while `next dev` is running.** It relinks `node_modules` under the live server, which then 500s every route with `Module not found: 'next/dist/esm/lib/constants'` (stale Turbopack graph). Fix: stop the dev server, then restart it (kill the process, `rm -rf .next/dev`, `next dev`). Next 16 also enforces one dev server per project dir.
- **Multi-agent canvas:** a peer (Orion) runs another app ("World Mod", pinned to `:3002`). Suica OS must stay on `:3000` (Google OAuth origin). Coordinate via `message_peer` before touching shared ports.
- **Sui server-gas routes are rate-limited** (`src/lib/ratelimit.ts`, per-IP fixed window): `/api/sui/charge` 5/h, `/api/sui/vault/pay` 10/min, `/api/sui/rogue` 20/min (in-memory / per-instance — swap for Redis on a multi-instance deploy). `charge` also keeps its 24h per-address cooldown.
- **ENS routes still need auth** — `/api/ens/mint` and `/api/ens/members` are unauthenticated and spend Sepolia gas. The EIP-191 device-key primitives exist (`src/lib/ens/device.ts`); server-side verification + rate limit on these is session 05's ENS lane (they own lib/ens minting/roles/auth/device + api/ens/{mint,roles,publish,index}). Do before Vercel.
- Moving an app remints it; the old name becomes an alias (only for apps minted with per-name resolvers).
- Folders minted before EAC sharing (shibuya-cafe, ethglobal, tokyo-hackers) have no manager, so nobody can share them.
- ENSv2 Sepolia contracts are a beta ("not final"); addresses in `web/src/lib/ens/contracts.ts`.

## Assistant, generated shells, real data (session 3a, 2026-09-26)

- **Decisions** (from a product grilling with the user; also in PRD §1/§3/§4/§7/§8 and CLAUDE.md): apps are places, not programs. One OS-wide Clippy-style assistant, "Tappy" (an original character). Wild apps show REAL read-only data. "Anything is possible": an LLM writes new SHELLS in the background, sandboxed and propose-only.
- **Real data:** `GET /api/portfolio?name=x.eth|0x…` does mainnet ENS + Ethplorer (freekey) → holdings, 24h/7d/30d change, 30d PnL (`web/src/lib/portfolio/*`). `liveBundleFor(app, base)` (wired by Apollo into useLiveBundle) swaps real data into portfolio/roast/Doom-losses bundles for any real wallet target. Verified: vitalik.eth $861K, 30d -$335K.
- **Generated shells** (`web/src/lib/genshell/*`, `/api/shells`, `shells/GeneratedShell.tsx`, `assistant/InstallTray.tsx`): a prompt naming an unknown program ("snake but …") opens instantly in the built-in shell while a tray Setup runs. The LLM is tried in order from GENSHELL_MODELS, default claude-sonnet-5 then gpt-5. **The gateway key is free tier, so Anthropic models 403 and gpt-5 is used (~2 min).** Then a static check → in-browser smoke test (hidden iframe, must call ready() + paint, one retry) → publish: Walrus blob + `suica.shell` text record on `<label>.shells.suica.eth` (system-owned folder, uses the new mintApp extraTexts). Verified end to end with SNAKE.EXE (snake.shells.suica.eth, Walrus sha256 matches). Local cache is `web/.genshells/` (gitignored).
- **Tappy** (`web/src/assistant/*`, mounted in OS.tsx): greeting, loss alert → Doom losses, install lifecycle balloons, Group Tab cap offer (¥5,000/¥15,000/always ask) → auto-settle within cap (paper mode verified), BSOD apology. Real-Sui auto-settle waits on Apollo's `autoExecuteSui`; until then real txs go through SignDialog.
- **Gotchas:** Chrome pauses rAF in hidden/off-screen cross-origin iframes, so the smoke-test frame is on-screen at opacity 0.01. The gstack browse daemon is SHARED between sessions (one tab, shared localStorage), so coordinate before browser QA. Excel shows $0.00 for sub-cent prices (e.g. WHITE at $0.0000355); that's a formatting fix for the Excel shell owner.
- **Next:** add AI Gateway credits to use Claude for shell generation. Pre-install the demo montage shells (tetris was deleted to regenerate with the fixed prompt). Replace Tappy's code thresholds with Jev tick questions.

## Onboarding + live data + Sui verification (2026-09-27)

- **Onboarding (3a):** no landing page — a Win98 "Welcome to Suica OS" dialog opens once per browser after boot (`web/src/os/Welcome.tsx`): the thesis, 8 clickable "Try it" prompts (open Start pre-filled), ENS-as-filesystem (sharing = EAC roles, moving = ENSv2 alias/symlink), agents & money, how-it-works. Reopens via Start search "what is this" / "how does this work" / "tour". PRD §2 and §8 were rewritten around this thesis, incl. a "names are files" demo beat (drag an app into shibuya-cafe → old name becomes an alias that still opens it → then share the folder via EAC).
- **Live data + search (3a/Orion):** `/api/gas` (live ETH+Sui gas), `/api/prices`, the `compare` live swap, and `os/searchRank.ts` (system/folder/username/share/welcome routes, target/shell/function mismatch penalties, exact-name pin, parent-folder fallback).
- **Sui SPONSORED PIPELINE VERIFIED END-TO-END (Apollo, 2026-09-27):** ran sponsor→sign→execute with the server as a stand-in sender — the on-chain balance changes prove the Enoki sponsor paid the gas (−0.002 SUI) while the sender paid only the transfer. zkLogin login also verified by the user. So the gasless thesis is proven on-chain (tx `F8CUvZTGXuMnK3kWUw5KYSsvH8CyervC65RxNB2A1Vg`). The pay money-path is hardened (no invented recipient/amount; prompt-injection/request/conditional refuse; complex prompts → risk 2 + note; perps long/short).
- **DEMO-CRITICAL ENS flows: VERIFIED on Sepolia (2026-09-27).** (1) **Alias/symlink** (moving an app leaves the old name resolving to the new one): 3 moved apps checked (qa-app-zryl, qa-pub-ih14, qa-tab-z5rh); each old name's `suica.ens` = the new name with the same manifest; `/?open=qa-tab-z5rh.suica.eth` opens `qa-tab-z5rh.qa-f-z5rh.suica.eth`. (2) **Folder sharing (EAC)**: 9/9 on `qa-share-9x4f.suica.eth` with two device keys — member mint 403 before share; owner grants member (tx 0xd063162a…); member mints into the folder but can't change roles (403); after revoke (0xf6c09a96…) member mint is 403 again; roles panel reads on-chain state. (Verified by 05 live + 3a read-only.)

## Advanced DeFi flows — all 3 REAL (Apollo, 2026-09-27)

User asked for all three "make it real". Done + verified on-chain (all sponsored/gasless, zkLogin-signed path proven; server-as-sender used to verify E2E):
- **(B) Programmable payroll** (`fn=payroll`, needs Orion's classifier stub): `POST /api/sui/vault/payroll` batches `agent_pay` per team member in ONE PTB from the AgentVault → AgentCap per-tx/per-day caps enforce ATOMICALLY (over-budget → whole batch reverts → BSOD), `fee_bps` to creator. runAction `runPayroll` (server-signed against the funded demo vault). Verified (3 paid, digest 8H5STktm…). Sponsored user-owned payroll = follow-up (needs user to own a vault cap).
- **(A) Rebalancer + (C) DCA** (`fn=portfolio` "rebal" action / `fn=dca` "start" action): real sponsored **SUI→SUSD swaps** through a **mock AMM pool we deployed** (DeepBook testnet is empty — no liquidity). New Move package `move/suica_pool` (`susd` mock coin + constant-price `pool`), published + seeded (0.1 SUI + 100k SUSD @ 3.0). ids in `web/src/lib/sui/pool-deployment.json` (packageId 0x2db0b46d…, pool 0xcf1fbf52…, susdType …::susd::SUSD). `SuiIntent` gains a `swap` kind → `tx.ts` builds coinWithBalance(in) → `pool::swap_*` → transfer out to signer; sponsor route + `allowedTargets` updated; runAction `runSwap` proposes it (guest → paper). Verified sponsored swap E2E: −0.01 SUI → +0.03 SUSD, sponsor paid gas (digest 5J1FSAiD…). Build/publish: `pnpm sui:build suica_pool` + `scripts/sui-pool-deploy.ts`.
- **Owned by Orion (app/intent side):** `payroll` FnKey+stub (action id "payroll"), portfolio "Rebalance…" + dca "Start DCA" actions, `params.weights` (rebalance amount from target weights — I currently swap a fixed 0.02 SUI; wire weights to compute it). DeepBook JSON-RPC note: official fullnode rejects JSON-RPC; our code uses gRPC (`SuiGrpcClient`) so it's unaffected — only ad-hoc recovery scripts used the publicnode JSON-RPC.
