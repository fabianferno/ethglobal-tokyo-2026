"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { ContextMenu, type MenuEntry } from "@/components/win99/Menu";
import { type DesktopItem, moveItem, openSystem, SYSTEM_APPS, toggleStart, useOS } from "./store";

/** The desktop: system icons only. Apps live in windows and are gone when closed. */
export function Desktop() {
  const items = useOS((s) => s.items);
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const bgMenu: MenuEntry[] = [
    { label: "New App…", icon: "logo", onClick: () => toggleStart(true) },
    "sep",
    { label: "Task Manager", icon: "task", onClick: () => openSystem("taskmgr") },
    { label: "Properties", icon: "settings", onClick: () => openSystem("mycomputer") },
  ];
  const iconMenu = (i: DesktopItem): MenuEntry[] => [{ label: "Open", onClick: () => openSystem(i.system) }];

  return (
    <div
      className="desktop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSel(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) setMenu({ x: e.clientX, y: e.clientY, items: bgMenu });
      }}
    >
      {items.map((i) => {
        const v = SYSTEM_APPS[i.system];
        return (
          <div
            key={i.id}
            className={`desk-icon ${sel === i.id ? "sel" : ""}`}
            style={{ left: i.x, top: i.y }}
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
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onDoubleClick={() => openSystem(i.system)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSel(i.id);
              setMenu({ x: e.clientX, y: e.clientY, items: iconMenu(i) });
            }}
          >
            <Icon name={v.icon} size={40} />
            <span className="label">{v.label}</span>
          </div>
        );
      })}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}
