"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/win99/Icon";

/**
 * Drag-and-drop for apps across the desktop and folder windows. Pointer events, not HTML5 DnD, to
 * match the desktop's own icon dragging. Drop targets are plain DOM markers:
 *   data-drop="desktop"         the desktop background
 *   data-drop="folder:<id>"     a folder icon on the desktop, or an open folder window
 * Hit-testing takes the top-most element under the pointer, so a window covering the desktop wins
 * and a non-folder window swallows the drop (nothing happens).
 */

export type DropTarget = { kind: "desktop" } | { kind: "folder"; id: string };

/** The drop target under (x, y), ignoring the dragged element itself and the ghost. */
export function dropTargetAt(x: number, y: number, dragged?: Element | null): DropTarget | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest("[data-drag-ghost]") || (dragged && dragged.contains(el))) continue;
    const drop = el.closest<HTMLElement>("[data-drop]")?.dataset.drop;
    if (!drop) return null;
    if (drop === "desktop") return { kind: "desktop" };
    if (drop.startsWith("folder:")) return { kind: "folder", id: drop.slice(7) };
    return null;
  }
  return null;
}

/* Hover highlight + ghost, shared by every drag source. */
type DragState = { over: string | null; ghost: { x: number; y: number; icon: IconName; label: string } | null };
let state: DragState = { over: null, ghost: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

export function setDragOver(target: DropTarget | null) {
  const over = target?.kind === "folder" ? target.id : null;
  if (over === state.over) return;
  state = { ...state, over };
  emit();
}
export function setGhost(ghost: DragState["ghost"]) {
  state = { ...state, ghost };
  emit();
}
export function endDrag() {
  state = { over: null, ghost: null };
  emit();
}

/** The folder id currently under a dragged app, if any. */
export function useDragOverId() {
  return useSyncExternalStore(subscribe, () => state.over, () => null);
}

/** True while an app is being dragged over this folder (icon or window). */
export function useDragOver(folderId: string) {
  return useSyncExternalStore(subscribe, () => state.over === folderId, () => false);
}

/** The icon that follows the pointer when an app is dragged out of a folder window. */
export function DragGhost() {
  const ghost = useSyncExternalStore(subscribe, () => state.ghost, () => null);
  if (!ghost) return null;
  return createPortal(
    <div data-drag-ghost className="desk-icon sel" style={{ position: "fixed", left: ghost.x - 46, top: ghost.y - 24, zIndex: 9999, pointerEvents: "none", opacity: 0.85 }}>
      <Icon name={ghost.icon} size={40} />
      <span className="label">{ghost.label}</span>
    </div>,
    document.body,
  );
}
