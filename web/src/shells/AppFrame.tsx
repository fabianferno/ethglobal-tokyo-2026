"use client";

import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { MenuBar, type MenuEntry } from "@/components/win99/Menu";
import { type AppManifest, SHELL_META } from "@/lib/compose/compose";
import type { Action, Bundle } from "@/lib/compose/shapes";
import { skeletonBundle } from "@/lib/compose/skeleton";
import { fetchContent } from "@/lib/content/client";
import type { ConcreteShell } from "@/lib/intent/types";
import { setPrefer, useGeneratedFor, useGenShells } from "@/lib/genshell/client";
import { detectProgram } from "@/lib/genshell/detect";
import { SceneStrip } from "@/scenes/Scene";
import { balloon, closeWindow, message, openApp } from "@/os/store";
import { type AppPicture, PictureFrame, usePicture } from "./Picture";
import { DoomShell } from "./Doom";
import { ExcelShell } from "./Excel";
import { ExplorerShell } from "./Explorer";
import { GeneratedShell } from "./GeneratedShell";
import { HologramShell } from "./Hologram";
import { MinesweeperShell } from "./Minesweeper";
import { NotepadShell } from "./Notepad";
import { PaintShell } from "./Paint";
import { WeatherShell } from "./Weather";

/** picture: a requested image ("with a picture of …"); only Paint draws it itself, other shells get a frame. */
export type ShellProps = { app: AppManifest; bundle: Bundle; preview?: boolean; run: (a: Action) => void; picture?: AppPicture | null };

const SHELLS: Record<ConcreteShell, (p: ShellProps) => React.ReactNode> = {
  excel: ExcelShell,
  minesweeper: MinesweeperShell,
  doom: DoomShell,
  paint: PaintShell,
  weather: WeatherShell,
  notepad: NotepadShell,
  hologram: HologramShell,
  explorer: ExplorerShell,
};

export type ContentState =
  | { status: "loading"; bundle: Bundle }
  | { status: "ready"; bundle: Bundle }
  | { status: "error"; bundle: Bundle; error: string };

/** Skeleton instantly; Gemini's content when it lands. Previews never call Gemini. */
export function useContent(app: AppManifest, preview: boolean): ContentState & { nonce: number; regenerate: () => void } {
  const skeleton = useMemo(() => skeletonBundle(app.shape, app.title), [app.shape, app.title]);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; s: ContentState } | null>(null);
  const key = `${app.id}:${nonce}`;
  useEffect(() => {
    if (preview) return;
    let live = true;
    fetchContent(app, nonce)
      .then((bundle) => live && setState({ key, s: { status: "ready", bundle } }))
      .catch((e: Error) => live && setState({ key, s: { status: "error", bundle: skeleton, error: e.message } }));
    return () => {
      live = false;
    };
  }, [app, nonce, preview, key, skeleton]);
  const s: ContentState = state?.key === key ? state.s : { status: "loading", bundle: skeleton };
  return { ...s, nonce, regenerate: () => setNonce((n) => n + 1) };
}

function ContentFailed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="sunken" style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, margin: "4px 0", background: "#fff" }}>
      <Icon name="error" size={32} />
      <div className="grow">
        <b>{error}</b>
        <div style={{ fontSize: 11, color: "#555" }}>Gemini didn&apos;t answer in time, or answered in the wrong shape.</div>
      </div>
      <button type="button" className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

/** One broken shell must never take the OS down: catch render errors per window and offer a retry. */
class ShellBoundary extends Component<{ children: ReactNode; retry?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <ContentFailed error="This app crashed while drawing." retry={() => (this.setState({ failed: false }), this.props.retry?.())} />;
  }
}

/**
 * The app's body: scene strip + shell (or its generated program). In a window it gets live content;
 * in the Start-menu preview it shows the skeleton only.
 */
export function ShellView({ app, preview, content }: { app: AppManifest; preview?: boolean; content?: ReturnType<typeof useContent> }) {
  const skeleton = useMemo(() => skeletonBundle(app.shape, app.title), [app.shape, app.title]);
  const bundle = content?.bundle ?? skeleton;
  const Shell = SHELLS[app.shell] ?? ExplorerShell;
  // "tetris but …": once TETRIS.EXE is installed (LLM-generated, sandboxed), it renders instead;
  // the built-in shell stays the fallback.
  const generated = useGeneratedFor(app);
  const run = preview || !content ? () => {} : (a: Action) => (a.id === "regenerate" ? content.regenerate() : balloon(a.label, "Not available in this app yet."));
  const picture = usePicture(app, !preview);
  const paintsItself = app.shell === "paint" && !generated;
  // Stateful shells (Notepad's text, Minesweeper's board, Doom's HUD) seed state from their first bundle:
  // remount them whenever new content lands so they never keep showing the skeleton.
  const contentKey = content ? `${content.status}:${content.nonce}` : "preview";
  const builtIn = <Shell key={contentKey} app={app} bundle={bundle} preview={preview} run={run} picture={picture} />;
  return (
    <>
      <SceneStrip kind={app.scene} height={preview ? 40 : 52} label={bundle.subtitle} />
      {content?.status === "error" && <ContentFailed error={content.error} retry={content.regenerate} />}
      {picture && !paintsItself && <PictureFrame pic={picture} preview={preview} />}
      <div className="grow" style={{ display: "flex", flexDirection: "column", marginTop: 3, minHeight: 0 }}>
        <ShellBoundary key={contentKey} retry={content?.regenerate}>
          {generated ? <GeneratedShell key={generated.label} app={app} bundle={bundle} preview={preview} run={run} shell={generated} fallback={builtIn} /> : builtIn}
        </ShellBoundary>
      </div>
    </>
  );
}

/** A running app window: menu bar + scene + shell. Nothing is saved; closing the window ends the app. */
export function AppWindow({ app, winId }: { app: AppManifest; winId: string }) {
  const content = useContent(app, false);
  const compatible = (Object.keys(SHELL_META) as ConcreteShell[]).filter((s) => SHELL_META[s].accepts.includes(app.shape));
  const program = useGenShells((s) => {
    const hit = detectProgram(app.prompt);
    return hit ? (s.shells[hit.label] ?? null) : null;
  });
  const usingGenerated = !!useGeneratedFor(app);

  const reshape = (shell: ConcreteShell) => {
    closeWindow(winId);
    openApp({ ...app, shell, icon: SHELL_META[shell].icon, title: app.title.replace(/^[^·]+·/, `${SHELL_META[shell].label} ·`) });
  };

  const file: MenuEntry[] = [
    { label: "Regenerate", icon: "document", kbd: "Ctrl+R", onClick: content.regenerate },
    {
      label: "Copy Prompt",
      icon: "notepad",
      onClick: () => {
        void navigator.clipboard?.writeText(app.prompt).catch(() => {});
        balloon("Prompt copied", app.prompt);
      },
    },
    "sep",
    { label: "Close", onClick: () => closeWindow(winId) },
  ];
  const builtInView: MenuEntry[] = compatible.map((s) => ({
    label: `${s === app.shell && !usingGenerated ? "● " : ""}${SHELL_META[s].label}`,
    icon: SHELL_META[s].icon,
    onClick: () => (program && setPrefer(app.id, false), reshape(s)),
  }));
  const view: MenuEntry[] = program ? [{ label: `${usingGenerated ? "● " : ""}${program.exe} (generated)`, icon: "document", onClick: () => setPrefer(app.id, true) }, "sep", ...builtInView] : builtInView;
  const help: MenuEntry[] = [
    {
      label: "How was this made?",
      icon: "info",
      onClick: () =>
        message(
          app.title,
          "info",
          `${app.jevSource === "jev" ? `Jev composed this app in ${app.jevMs} ms` : "Composed by the offline keyword classifier"}: ${SHELL_META[app.shell].label} × ${app.shape}, ${app.vibe} tone. Gemini wrote the content.`,
          JSON.stringify({ prompt: app.prompt, shell: app.shell, shape: app.shape, vibe: app.vibe, scene: app.scene, params: app.params }, null, 1),
        ),
    },
  ];
  return (
    <>
      <MenuBar menus={[{ label: "File", items: file }, { label: "View", items: view }, { label: "Help", items: help }]} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", padding: 3, minHeight: 0 }}>
        <ShellView app={app} content={content} />
      </div>
      <div className="statusbar">
        <div>{app.jevSource === "jev" ? `Composed by Jev in ${app.jevMs} ms` : "Composed offline"}</div>
        <div>
          {SHELL_META[app.shell].label} × {app.shape}
        </div>
        <div>{content.status === "loading" ? "Gemini is writing…" : content.status === "error" ? "Content failed" : "Live"}</div>
      </div>
    </>
  );
}
