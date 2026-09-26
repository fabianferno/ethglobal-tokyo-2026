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
| 6 shells (Excel, Minesweeper, Paint, Weather, Notepad, Explorer), ~20 functions, 7 GSAP scenes | Done, **data is mock** (`web/src/lib/chain/mock.ts`) |
| ENSv2 Sepolia: `suica.eth` registered, own UserRegistry + PermissionedResolver | Done (`web/src/lib/ens/deployment.json`, `pnpm ens:setup`) |
| Apps/folders minted as subnames; full manifest in text record `suica.manifest`; `suica.published`; index read from `LabelRegistered` events | Done (`web/src/lib/ens/onchain.ts`, `/api/ens/{mint,index,publish}`, `pnpm ens:seed`) |
| Sui SDKs installed (`@mysten/sui` 2.33, `@mysten/enoki` 1.2) | Installed, **no Sui code written yet** |

On-chain: 3 folders (shibuya-cafe, ethglobal, tokyo-hackers) + 12 published apps under suica.eth. Test leftovers: `qa-lab.suica.eth`, `weather-2.suica.eth`, `weather-2.qa-lab.suica.eth`.

## Wallets and keys (values only in `web/.env.local`)

| What | Address / id | Notes |
|---|---|---|
| Sepolia server wallet (owns suica.eth, mints everything) | `0xC9Be7046Ed1DDb8E5ea30bB3Af12FbF56Cd717F0` | ~0.98 ETH left |
| Sui testnet server wallet | `0xbf7762e87fc8ffd8f6f0cd06c24b5b4023ad9081c448b8722dba5127dadc54bb` | **Needs funding** (faucet.sui.io; the scripted faucet is rate-limited) |
| Enoki app | `ENOKI_PRIVATE_KEY` | zkLogin + sponsored txs, testnet/devnet. Verified with `getApp()`. |
| Google OAuth client | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = `253257974343-n25bcke97cm02su5apq3eppmlb8ejg65.apps.googleusercontent.com` | origin + redirect `http://localhost:3000`. Client secret not needed. |

## Pending user actions
1. **Enoki portal:** add Auth Provider → Google with the client id above, and allowed origin `http://localhost:3000` (and later the Vercel domain). `getApp()` still showed no providers/origins.
2. **Fund the Sui server wallet** with testnet SUI (faucet.sui.io), and optionally Circle testnet USDC (faucet.circle.com → Sui testnet) so the server can top up users.
3. Add `AI_GATEWAY_API_KEY` to test Jev live.

## Order of work (user-chosen): 1 → 3 → 2
1. **ENS folder sharing via EAC** — designed, not built.
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
- **Each app's "Sui wallet" = an `AgentVault<T>` shared object** (Move), with an `AgentCap` (per-tx/per-day caps, allowed recipients, expiry) and `fee_bps` to the creator. The vault id goes into the app's ENS record under Sui coin type 784, so `x.suica.eth` resolves to its Sui vault. A rogue agent over its cap → Move abort → real BSOD. **Blocked:** needs Move compilation; the user said not to install the Sui CLI here — ask how they want to build/publish.
- **First real flow: Group Tab settle-up** — one sponsored PTB paying each member their share. Members "Join tab", which writes their Sui address into the app's ENS text record (e.g. `suica.members`); settle-up reads recipients from ENS.
- **Real balances** in the Portfolio app for the logged-in user (and vaults) — also serves the Curvegrid track.
- **Stretch:** DeepBook DCA (testnet). Suilend/Cetus/Bluefin stay mock ("paper mode").
- Idea: "Charge your Suica" top-up (server sends a little USDC to new users) and a tap-to-pay animation for `checkout.shibuya-cafe.suica.eth`.

### Sui — implementation plan (next steps)
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
- `/api/ens/mint` has no auth or rate limit.
- Moving/renaming an app remints and leaves the old name orphaned.
- FolderView's roles list is mock until task 1 lands.
- ENSv2 Sepolia contracts are a beta ("not final"); addresses in `web/src/lib/ens/contracts.ts`.
