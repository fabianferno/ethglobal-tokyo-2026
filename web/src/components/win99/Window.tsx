"use client";

import { type ReactNode, useRef } from "react";
import { closeWindow, focus, patchWindow, type Win } from "@/os/store";
import { Icon } from "./Icon";

const Glyph = {
  min: <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="7" width="7" height="2" fill="currentColor" /></svg>,
  max: <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" /><rect x="1" y="1" width="8" height="2" fill="currentColor" /></svg>,
  restore: <svg width="10" height="10" viewBox="0 0 10 10"><rect x="3" y="0.5" width="6" height="6" fill="none" stroke="currentColor" /><rect x="0.5" y="3.5" width="6" height="6" fill="var(--face)" stroke="currentColor" /><rect x="0.5" y="3.5" width="6" height="1.5" fill="currentColor" /></svg>,
  close: <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="2" /></svg>,
};

export function Window({ win, active, children }: { win: Win; active: boolean; children: ReactNode }) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const size = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const style = win.max
    ? { left: 0, top: 0, width: "100vw", height: "calc(100vh - 40px)", zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <div
      className={`window ${active ? "active" : ""} ${win.max ? "maximized" : ""}`}
      style={{ ...style, display: win.min ? "none" : undefined }}
      onPointerDownCapture={() => focus(win.id)}
      role="dialog"
      aria-label={win.title}
    >
      <div
        className="titlebar"
        onDoubleClick={() => !win.dialog && patchWindow(win.id, { max: !win.max })}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button") || win.max) return;
          drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const x = Math.min(window.innerWidth - 80, Math.max(-win.w + 80, e.clientX - drag.current.dx));
          const y = Math.min(window.innerHeight - 70, Math.max(0, e.clientY - drag.current.dy));
          patchWindow(win.id, { x, y });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <Icon name={win.icon} size={18} />
        <span className="title">{win.title}</span>
        <div className="titlebar-btns">
          {!win.dialog && (
            <>
              <button className="tb-btn" aria-label="Minimize" onClick={() => patchWindow(win.id, { min: true })}>{Glyph.min}</button>
              <button className="tb-btn" aria-label={win.max ? "Restore" : "Maximize"} onClick={() => patchWindow(win.id, { max: !win.max })}>{win.max ? Glyph.restore : Glyph.max}</button>
            </>
          )}
          <button className="tb-btn close" aria-label="Close" onClick={() => closeWindow(win.id)}>{Glyph.close}</button>
        </div>
      </div>
      <div className="window-body">{children}</div>
      {!win.max && !win.dialog && (
        <div
          className="resize-grip"
          onPointerDown={(e) => {
            size.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!size.current) return;
            patchWindow(win.id, { w: Math.max(280, size.current.w + e.clientX - size.current.x), h: Math.max(180, size.current.h + e.clientY - size.current.y) });
          }}
          onPointerUp={() => (size.current = null)}
        />
      )}
    </div>
  );
}
