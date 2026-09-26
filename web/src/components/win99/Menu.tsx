"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

export type MenuEntry =
  | { label: string; icon?: IconName; kbd?: string; disabled?: boolean; onClick: () => void }
  | "sep";

export function MenuList({ items, onPick, style }: { items: MenuEntry[]; onPick?: () => void; style?: React.CSSProperties }) {
  return (
    <div className="menu" style={style} role="menu" onPointerDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className="menu-item"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onPick?.();
              it.onClick();
            }}
          >
            {it.icon ? <Icon name={it.icon} size={18} /> : <span style={{ width: 18 }} />}
            <span>{it.label}</span>
            {it.kbd && <span className="kbd">{it.kbd}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** File / Edit / View … with dropdowns. Closes on outside click. */
export function MenuBar({ menus }: { menus: { label: string; items: MenuEntry[] }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="menubar" ref={ref} style={{ position: "relative" }}>
      {menus.map((m, i) => (
        <button
          key={m.label}
          className={open === i ? "open" : ""}
          onClick={() => setOpen(open === i ? null : i)}
          onPointerEnter={() => open !== null && setOpen(i)}
        >
          <u>{m.label[0]}</u>
          {m.label.slice(1)}
        </button>
      ))}
      {open !== null && (
        <MenuList items={menus[open].items} onPick={() => setOpen(null)} style={{ top: "100%", left: 2 + open * 52 }} />
      )}
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 210);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - items.length * 30 - 60);
  return <MenuList items={items} onPick={onClose} style={{ position: "fixed", left, top }} />;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
export function ToolButton({ icon, label, onClick }: { icon: IconName; label: string; onClick?: () => void }) {
  return (
    <button className="tool-btn" onClick={onClick}>
      <Icon name={icon} size={24} />
      {label}
    </button>
  );
}
