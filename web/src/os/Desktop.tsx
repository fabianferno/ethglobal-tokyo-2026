"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { ContextMenu, type MenuEntry } from "@/components/win99/Menu";
import { DragGhost, dropTargetAt, endDrag, setDragOver, useDragOverId } from "./dnd";
import {
  balloon,
  type DesktopItem,
  message,
  moveIntoFolder,
  moveItem,
  openApp,
  openFolder,
  openSystem,
  mintItem,
  openWindow,
  setPublished,
  SYSTEM_APPS,
  toggleStart,
  trashItem,
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
  const dropTarget = useDragOverId();
  const drag = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const bgMenu = (x: number, y: number): MenuEntry[] => [
    { label: "New App…", icon: "logo", onClick: () => toggleStart(true) },
    { label: "New Folder (workspace)…", icon: "folder", onClick: () => openWindow({ title: "New Folder", icon: "folder", payload: { type: "newfolder" }, w: 420, h: 230, dialog: true }) },
    "sep",
    { label: "Task Manager", icon: "task", onClick: () => openSystem("taskmgr") },
    { label: "Refresh", onClick: () => balloon("Refreshed", `Re-resolved ${items.length} ENS names.`) },
    "sep",
    { label: "Properties", icon: "settings", onClick: () => message("Display Properties", "computer", "Suica OS\nApps are agents. UI is composed by Jev in ~100ms.", `desktop @ ${x},${y}`) },
  ];

  const iconMenu = (i: DesktopItem): MenuEntry[] => [
    { label: "Open", onClick: () => open(i) },
    ...(i.kind === "app"
      ? ([
          { label: i.app.published ? "Unpublish" : "Publish to Network", icon: "network", onClick: () => void setPublished(i.id, !i.app.published) },
          { label: "Save As… (rename)", icon: "folder", onClick: () => openWindow({ title: "Save As", icon: "folder", payload: { type: "saveas", app: i.app }, w: 440, h: 260, dialog: true }) },
        ] as MenuEntry[])
      : []),
    ...(i.kind !== "system" && i.chain?.status !== "onchain" && i.chain?.status !== "minting"
      ? ([{ label: "Mint on ENS", icon: "globe", onClick: () => void mintItem(i.id) }] as MenuEntry[])
      : []),
    ...(i.kind !== "system" && i.chain?.txs?.[0]
      ? ([{ label: "View on Etherscan", icon: "globe", onClick: () => window.open(i.chain!.txs![0], "_blank", "noopener") }] as MenuEntry[])
      : []),
    ...(i.kind !== "system" ? (["sep", { label: "Delete (revoke)", icon: "recycle", onClick: () => trashItem(i.id) }] as MenuEntry[]) : []),
  ];

  return (
    <div
      className="desktop"
      data-drop="desktop"
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
            data-drop={i.kind === "folder" ? `folder:${i.id}` : undefined}
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
              // Only apps move into folders: a folder icon or an open folder window.
              setDragOver(i.kind === "app" ? dropTargetAt(e.clientX, e.clientY, e.currentTarget) : null);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              endDrag();
              if (!d?.moved || i.kind !== "app") return;
              const t = dropTargetAt(e.clientX, e.clientY, e.currentTarget);
              if (t?.kind === "folder") moveIntoFolder(i.id, t.id);
            }}
            onPointerCancel={() => {
              drag.current = null;
              endDrag();
            }}
            onDoubleClick={() => open(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSel(i.id);
              setMenu({ x: e.clientX, y: e.clientY, items: iconMenu(i) });
            }}
          >
            <span style={{ position: "relative", lineHeight: 0 }}>
              <Icon name={v.icon} size={40} />
              {i.kind !== "system" && <ChainBadge status={i.chain?.status} />}
            </span>
            <span className="label">{v.label}</span>
            {i.kind !== "system" && <span className="label ens">{v.sub}</span>}
          </div>
        );
      })}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
      <DragGhost />
    </div>
  );
}

/** Tiny corner badge: is this name on ENS yet? */
function ChainBadge({ status }: { status?: string }) {
  const [bg, text, title] =
    status === "onchain" ? ["var(--success-b)", "✓", "Minted on ENS"] : status === "minting" ? ["#c98a00", "…", "Minting on ENS"] : status === "failed" ? ["var(--danger-b)", "!", "Mint failed"] : ["var(--pal-gray3)", "·", "Local only"];
  return (
    <span title={title} style={{ position: "absolute", right: -6, bottom: -2, minWidth: 14, height: 14, padding: "0 2px", borderRadius: 7, background: bg, color: "#fff", border: "1px solid #1b1b1b", fontSize: 10, fontWeight: 900, lineHeight: "12px", textAlign: "center" }}>
      {text}
    </span>
  );
}
