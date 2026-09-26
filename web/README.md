# Suica OS — web

Next.js 16 · React 19 · TypeScript · GSAP · `@typesafe-ai/sdk` (Jev, routed through Vercel AI Gateway). No UI framework — the Win98 kit is hand-written CSS.

Set `AI_GATEWAY_API_KEY` in `.env.local` to call Jev (`typesafe-ai/jev`) via `https://ai-gateway.vercel.sh/typesafe`. Without it, the offline classifier answers with the same output shape.

## How a prompt becomes an app

```
Start search keystroke
  → /api/intent  (src/app/api/intent/route.ts)
      Jev: ONE call, ~12 typed questions + 1 yes/no per published-app candidate
      (offline fallback: src/lib/intent/mock.ts, same shape)
  → parse()      (src/lib/intent/parse.ts)   ENS names, tokens, amounts, leverage, schedule
  → draftManifest(shell × fn × target × vibe) (src/lib/compose/compose.ts)
  → FUNCTIONS[fn].build() → data shapes       (src/lib/compose/functions.ts)
  → SHELLS[shell] renders the shapes          (src/shells/*)
  → SceneStrip picks a GSAP scene             (src/scenes/Scene.tsx)
```

**Jev decides, code computes.** Jev only picks from closed sets (shell, function, vibe, scene, risk, yes/no signals). Every number comes from the parser or chain reads.

## Map

| Path | What |
|---|---|
| `src/styles/win99.css` | The Windows 98 UI kit (tokens + components) |
| `src/components/win99/` | Icon set, Window frame, menus, list view, charts |
| `src/lib/intent/` | Jev question schema, client, offline classifier, parser |
| `src/lib/compose/` | Data shapes, functions (crypto capabilities), composer, published-app index |
| `src/lib/chain/mock.ts` | Deterministic stand-in for ENS/Sui reads (seeded by ENS name) |
| `src/shells/` | Excel, Minesweeper, Paint, Weather, Notepad, Explorer (fallback) |
| `src/system/` | Fixed OS surfaces: Signing dialog, Task Manager, My Computer, Network Neighborhood, folders, Recycle Bin, UI Kit |
| `src/os/` | Store (windows, desktop, signing, activity), Desktop, Taskbar, Start menu |

### Adding a shell
1. Add the key to `SHELL_KEYS` (`src/lib/intent/types.ts`) and a criterion in `src/lib/intent/questions.ts`.
2. Add `SHELL_META` (which shapes it accepts) in `src/lib/compose/compose.ts`.
3. Write `src/shells/<Name>.tsx` and register it in `src/shells/AppFrame.tsx`.
4. Teach the offline classifier (`src/lib/intent/mock.ts`).

### Adding a function
1. Add the key to `FN_KEYS` + a criterion in `questions.ts`.
2. Add a `FUNCTIONS` entry that returns shapes + proposed txs (`src/lib/compose/functions.ts`).
3. Teach `mock.ts`.

## Demo tips
- `Ctrl+Esc` opens Start. Arrow keys + Enter pick a result.
- Drag an app icon onto a folder → its ENS name re-roots under the folder (`grouptab.team.suica.eth`).
- Task Manager → Options → *Simulate rogue agent* → BSOD.
- `/?open=<ens>` opens a published agent after log-on (share links).

## Status
Mock chain data. Next: ENSv2 Sepolia subnames + text-record manifests, Sui zkLogin + sponsored tx + `AgentVault` Move package, MultiBaas indexing. See `../docs/PRD.md` §9.

## ENS (ENSv2 on Sepolia)

Every app and folder is a real ENSv2 subname under **`suica.eth`**, minted by a server wallet:

```
suica.eth                                   own UserRegistry + PermissionedResolver
├── grouptab.suica.eth                      app   · text: class=Application, suica.manifest (JSON), suica.published
└── qa-lab.suica.eth                        folder· text: class=Group · its own UserRegistry
    └── weather.qa-lab.suica.eth            app in a folder
```

- `src/lib/ens/contracts.ts` — ENSv2 Sepolia addresses, ABIs, roles, CREATE2 address prediction
- `src/lib/ens/onchain.ts` — mint app/folder, publish, and the index (registry `LabelRegistered` events + text records)
- `src/lib/ens/deployment.json` — where suica.eth's registry/resolver live
- `/api/ens/mint`, `/api/ens/publish`, `/api/ens/index` — route handlers the desktop calls in the background
- The app's full manifest lives on-chain, so a shared/published app is rebuilt from ENS alone.

Needs `SEPOLIA_PRIVATE_KEY` (funded with Sepolia ETH) in `.env.local`. Without it, apps stay local and the index falls back to the demo list.

```bash
pnpm ens:setup   # one-time: register suica.eth (idempotent)
pnpm ens:seed    # mint the demo published apps (idempotent)
```
