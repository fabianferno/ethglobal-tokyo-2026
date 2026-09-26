"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { ContextMenu, type MenuEntry } from "@/components/win99/Menu";
import {
  balloon,
  type DesktopItem,
  message,
  moveIntoFolder,
  moveItem,
  openApp,
  openFolder,
  openSystem,
  openWindow,
  SYSTEM_APPS,
  toggleStart,
  trashItem,
  updateApp,
  useOS,
} from "./store";

function itemView(i: DesktopItem) {
  if (i.kind === "system") return { icon: SYSTEM_APPS[i.system].icon, label: SYSTEM_APPS[i.system].label, sub: "" };
  if (i.kind === "folder") return { icon: "folder" as const, label: i.name, sub: i.ens };
  return { icon: i.app.icon, label: i.app.title, sub: i.app.ens };
}

function open(i: DesktopItem) {
  if (i.kind === "system") openSystem(i.system);
  else if (i.kind === "folder") openFolder(i.id);
  else openApp(i.app);
}

export function Desktop() {
  const items = useOS((s) => s.items).filter((i) => i.parent === null);
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const folderAt = (x: number, y: number, except: string) =>
    items.find((f) => f.kind === "folder" && f.id !== except && x >= f.x && x <= f.x + 92 && y >= f.y && y <= f.y + 80);

  const bgMenu = (x: number, y: number): MenuEntry[] => [
    { label: "New App…", icon: "logo", onClick: () => toggleStart(true) },
    { label: "New Folder (workspace)…", icon: "folder", onClick: () => openWindow({ title: "New Folder", icon: "folder", payload: { type: "newfolder" }, w: 420, h: 230, dialog: true }) },
    "sep",
    { label: "Task Manager", icon: "task", onClick: () => openSystem("taskmgr") },
    { label: "Refresh", onClick: () => balloon("Refreshed", `Re-resolved ${items.length} ENS names.`) },
    "sep",
    { label: "Properties", icon: "settings", onClick: () => message("Display Properties", "computer", "AgentOS 99\nApps are agents. UI is composed by Jev in ~100ms.", `desktop @ ${x},${y}`) },
  ];

  const iconMenu = (i: DesktopItem): MenuEntry[] => [
    { label: "Open", onClick: () => open(i) },
    ...(i.kind === "app"
      ? ([
          { label: i.app.published ? "Unpublish" : "Publish to Network", icon: "network", onClick: () => (updateApp(i.id, { published: !i.app.published }), balloon(i.app.published ? "Unpublished" : "Published", i.app.ens)) },
          { label: "Save As… (rename)", icon: "folder", onClick: () => openWindow({ title: "Save As", icon: "folder", payload: { type: "saveas", app: i.app }, w: 440, h: 260, dialog: true }) },
        ] as MenuEntry[])
      : []),
    ...(i.kind !== "system" ? (["sep", { label: "Delete (revoke)", icon: "recycle", onClick: () => trashItem(i.id) }] as MenuEntry[]) : []),
  ];

  return (
    <div
      className="desktop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSel(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) setMenu({ x: e.clientX, y: e.clientY, items: bgMenu(e.clientX, e.clientY) });
      }}
    >
      {items.map((i) => {
        const v = itemView(i);
        return (
          <div
            key={i.id}
            className={`desk-icon ${sel === i.id ? "sel" : ""} ${dropTarget === i.id ? "drop-target" : ""}`}
            style={{ left: i.x, top: i.y }}
            title={v.sub}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              setSel(i.id);
              drag.current = { id: i.id, dx: e.clientX - i.x, dy: e.clientY - i.y, sx: e.clientX, sy: e.clientY, moved: false };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.id !== i.id) return;
              if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
              d.moved = true;
              moveItem(i.id, e.clientX - d.dx, e.clientY - d.dy);
              const f = i.kind === "app" ? folderAt(e.clientX, e.clientY, i.id) : undefined;
              setDropTarget(f?.id ?? null);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              setDropTarget(null);
              if (!d?.moved || i.kind !== "app") return;
              const f = folderAt(e.clientX, e.clientY, i.id);
              if (f) moveIntoFolder(i.id, f.id);
            }}
            onDoubleClick={() => open(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSel(i.id);
              setMenu({ x: e.clientX, y: e.clientY, items: iconMenu(i) });
            }}
          >
            <Icon name={v.icon} size={40} />
            <span className="label">{v.label}</span>
            {i.kind !== "system" && <span className="label ens">{v.sub}</span>}
          </div>
        );
      })}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}
