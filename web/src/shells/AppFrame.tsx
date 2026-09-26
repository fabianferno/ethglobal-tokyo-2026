"use client";

import { useMemo } from "react";
import { MenuBar, type MenuEntry } from "@/components/win99/Menu";
import { type AppManifest, buildBundle, SHELL_META } from "@/lib/compose/compose";
import type { Action, Bundle } from "@/lib/compose/shapes";
import type { ConcreteShell } from "@/lib/intent/types";
import { SceneStrip } from "@/scenes/Scene";
import { balloon, closeWindow, getOS, installApp, message, openApp, openWindow, propose, setPublished, updateApp } from "@/os/store";
import { ExcelShell } from "./Excel";
import { ExplorerShell } from "./Explorer";
import { MinesweeperShell } from "./Minesweeper";
import { NotepadShell } from "./Notepad";
import { PaintShell } from "./Paint";
import { WeatherShell } from "./Weather";

export type ShellProps = { app: AppManifest; bundle: Bundle; preview?: boolean; run: (a: Action) => void };

const SHELLS: Record<ConcreteShell, (p: ShellProps) => React.ReactNode> = {
  excel: ExcelShell,
  minesweeper: MinesweeperShell,
  paint: PaintShell,
  weather: WeatherShell,
  notepad: NotepadShell,
  explorer: ExplorerShell,
};

export function runAction(a: Action) {
  if (a.tx) void propose(a.tx);
  else balloon(a.label, "Coming soon in this agent.");
}

export function ShellView({ app, preview }: { app: AppManifest; preview?: boolean }) {
  const bundle = useMemo(() => buildBundle(app), [app]);
  const Shell = SHELLS[app.shell];
  return (
    <>
      <SceneStrip kind={app.scene} height={preview ? 40 : 52} label={bundle.subtitle} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", marginTop: 3, minHeight: 0 }}>
        <Shell app={app} bundle={bundle} preview={preview} run={preview ? () => {} : runAction} />
      </div>
    </>
  );
}

function installedItem(app: AppManifest) {
  return getOS().items.find((i) => i.kind === "app" && i.app.id === app.id);
}

/** A running app window: menu bar + scene + shell. */
export function AppWindow({ app, winId }: { app: AppManifest; winId: string }) {
  const bundle = useMemo(() => buildBundle(app), [app]);
  const compatible = (Object.keys(SHELL_META) as ConcreteShell[]).filter((s) => SHELL_META[s].accepts.some((k) => bundle[k] !== undefined));
  const item = installedItem(app);
  const isPublic = app.id.startsWith("ens:") || getOS().index.some((p) => p.ens === app.ens);

  const reshape = (shell: ConcreteShell) => {
    const next = { ...app, shell, icon: shell === "explorer" ? app.icon : SHELL_META[shell].icon };
    if (item) updateApp(item.id, next);
    closeWindow(winId);
    openApp(next);
  };

  const file: MenuEntry[] = [
    { label: "Save As…", icon: "folder", kbd: "Ctrl+S", onClick: () => openWindow({ title: "Save As", icon: "folder", payload: { type: "saveas", app }, w: 440, h: 260, dialog: true }) },
    ...(!item && isPublic ? [{ label: "Pin to Desktop", icon: "computer" as const, onClick: () => (installApp(app, null, { pin: true }), balloon("Pinned", app.ens)) }] : []),
    {
      label: app.published ? "Unpublish" : "Publish to Network",
      icon: "network",
      disabled: !item,
      onClick: () => item && void setPublished(item.id, !app.published),
    },
    {
      label: "Copy Share Link",
      icon: "globe",
      onClick: () => {
        const link = `${location.origin}/?open=${encodeURIComponent(app.ens)}`;
        void navigator.clipboard?.writeText(link).catch(() => {});
        balloon("Link copied", link);
      },
    },
    "sep",
    { label: "Close", onClick: () => closeWindow(winId) },
  ];
  const view: MenuEntry[] = compatible.map((s) => ({ label: `${s === app.shell ? "● " : ""}${SHELL_META[s].label}`, icon: SHELL_META[s].icon, onClick: () => reshape(s) }));
  const help: MenuEntry[] = [
    {
      label: "About this agent…",
      icon: "info",
      onClick: () => message(`About ${app.ens}`, "agent", `${app.title}\n${app.description}`, JSON.stringify({ ens: app.ens, shell: app.shell, fn: app.fn, vibe: app.vibe, scene: app.scene, target: app.target, params: app.params }, null, 1)),
    },
  ];
  return (
    <>
      <MenuBar menus={[{ label: "File", items: file }, { label: "View", items: view }, { label: "Help", items: help }]} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", padding: 3, minHeight: 0 }}>
        <ShellView app={app} />
      </div>
      <div className="statusbar">
        <div>{app.readOnly ? `Viewing ${app.target} (read-only)` : `Agent ${app.ens}`}</div>
        <div>{SHELL_META[app.shell].label} × {app.fn}</div>
        <div>{app.published ? "🌐 Published" : "🔒 Private"}</div>
      </div>
    </>
  );
}
