# Jev OS — web

Next.js 16 · React 19 · TypeScript · GSAP · `@typesafe-ai/sdk` (Jev, routed through Vercel AI Gateway) · zod · vitest. No UI framework — the Win98 kit is hand-written CSS.

## Run it

```bash
pnpm install
# web/.env.local
#   AI_GATEWAY_API_KEY=…   Jev (needs paid gateway credits; the free tier blocks typesafe-ai/jev)
#   GEMINI_API_KEY=…       app content + pictures
pnpm dev                   # http://localhost:3000
```

Without `AI_GATEWAY_API_KEY` the offline keyword classifier answers instead, and the Start menu shows an "offline" chip.

## How a prompt becomes an app

```
Start search keystroke
  → /api/intent        Jev: one call, 5 typed questions in parallel (shell, shape, vibe, scene, nonsense)
                       offline fallback: src/lib/intent/mock.ts, same shape
  → topCombos / draftManifest   shell × shape × vibe + prompt   (src/lib/compose/compose.ts)
  → Start preview      the chosen shell renders a skeleton of that shape   (src/lib/compose/skeleton.ts)
Enter
  → window opens instantly with the skeleton
  → /api/content       Gemini writes JSON for that shape; zod validates it into a Bundle   (src/lib/content/)
  → the shell re-renders with the content; Regenerate asks again
"tetris but …"
  → app opens in a fallback shell; an LLM writes TETRIS.EXE in the background (src/lib/genshell/),
    it is smoke-tested in the sandbox, cached on the server, and swapped in
```

**Jev decides, code builds, Gemini writes.** Jev only picks from closed sets. Shells only render shapes. Content is validated before any shell sees it.

## Map

| Path | What |
|---|---|
| `src/styles/win99.css` | The Windows 98 UI kit (tokens + components) |
| `src/components/win99/` | Icon set, Window frame, menus, list view, charts |
| `src/lib/intent/` | Jev question schema, client, offline classifier, picture parser |
| `src/lib/compose/` | Data shapes, skeletons, composer (shell × shape) |
| `src/lib/content/` | Gemini prompt, per-shape zod schemas, server call + cache, client fetch |
| `src/lib/genshell/` | LLM-written programs: generator, sandbox runtime, install flow |
| `src/shells/` | Excel, Minesweeper, Doom, Paint, Weather, Notepad, 3D View, Explorer, Picture + the app frame |
| `src/os/` | Desktop, Start menu, taskbar, Welcome dialog, window store |
| `src/system/` | About Jev OS, Task Manager, UI Kit, message box |
| `src/assistant/` | Tappy |

## Checks

```bash
pnpm test                       # vitest
pnpm exec tsc --noEmit
pnpm lint
./node_modules/.bin/tsx scripts/jev-smoke.mts http://localhost:3000   # 20 prompts end to end, Jev p50/p90
```
