"use client";

import { useSyncExternalStore } from "react";
import type { IconName } from "@/components/win99/Icon";
import type { Tree } from "@/lib/kit/types";
import { playSound } from "./sounds";

/**
 * The OS: system icons on the desktop and open windows. Apps exist only in their windows — nothing is
 * saved, so a reload is a fresh desktop and closing a window ends that app.
 */

/** A composed app: its prompt, and the layout Jev drew in the Start preview (shown while the data loads). */
export type AppSpec = { id: string; title: string; prompt: string; tree: Tree | null };

let seq = 0;
export const newId = (p = "app") => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export type SystemKey = "mycomputer" | "taskmgr" | "kit";

export const SYSTEM_APPS: Record<SystemKey, { label: string; icon: IconName; w: number; h: number }> = {
  mycomputer: { label: "About Jev OS", icon: "computer", w: 460, h: 300 },
  taskmgr: { label: "Task Manager", icon: "task", w: 640, h: 380 },
  kit: { label: "UI Kit", icon: "logo", w: 760, h: 520 },
};

export type DesktopItem = { id: string; kind: "system"; system: SystemKey; x: number; y: number };

export type WinPayload =
  | { type: "app"; app: AppSpec }
  | { type: "system"; key: SystemKey }
  | { type: "msg"; icon: IconName; text: string; detail?: string };

export type Win = {
  id: string;
  title: string;
  icon: IconName;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  min: boolean;
  max: boolean;
  dialog?: boolean;
  payload: WinPayload;
};

export type OSState = {
  items: DesktopItem[];
  windows: Win[];
  z: number;
  startOpen: boolean;
  balloon: { title: string; text: string } | null;
  booted: boolean;
  /** Per app window: Decisions calls and compose time of its latest composition. */
  stats: Record<string, { calls: number; ms: number; offline: boolean }>;
};

const GRID_Y = 96;
const SYSTEM_ORDER: SystemKey[] = ["mycomputer", "taskmgr", "kit"];

const initial: OSState = { items: [], windows: [], z: 10, startOpen: false, balloon: null, booted: false, stats: {} };

let state: OSState = initial;
const listeners = new Set<() => void>();

function set(fn: (s: OSState) => Partial<OSState>) {
  state = { ...state, ...fn(state) };
  listeners.forEach((l) => l());
}

/** Fresh desktop: the system icons, no windows. Plays the startup sound once per page load. */
export function boot() {
  if (state.booted) return;
  set(() => ({ items: SYSTEM_ORDER.map((k, i) => ({ id: `sys_${k}`, kind: "system", system: k, x: 8, y: 8 + i * GRID_Y })), booted: true }));
  playSound("startup");
}

export function useOS<T>(sel: (s: OSState) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
    () => sel(initial),
  );
}
export const getOS = () => state;

/* ── Desktop ─────────────────────────────────────────────── */

export function moveItem(id: string, x: number, y: number) {
  set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, x: Math.max(0, x), y: Math.max(0, y) } : i)) }));
}

/* ── Windows ─────────────────────────────────────────────── */

function place(w: number, h: number, count: number) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight - 40 : 760;
  const ww = Math.min(w, vw - 16);
  const hh = Math.min(h, vh - 16);
  const off = (count % 8) * 26;
  return { x: Math.max(8, Math.round((vw - ww) / 2 - 90 + off)), y: Math.max(8, Math.round((vh - hh) / 2 - 60 + off)), w: ww, h: hh };
}

export function openWindow(p: { title: string; icon: IconName; payload: WinPayload; w?: number; h?: number; dialog?: boolean; single?: string }): string {
  const s = getOS();
  if (p.single) {
    const existing = s.windows.find((w) => singleKey(w) === p.single);
    if (existing) {
      focus(existing.id);
      if (existing.min) set((st) => ({ windows: st.windows.map((w) => (w.id === existing.id ? { ...w, min: false } : w)) }));
      return existing.id;
    }
  }
  const id = newId("win");
  const geo = place(p.w ?? 640, p.h ?? 440, s.windows.length);
  set((st) => ({
    z: st.z + 1,
    startOpen: false,
    windows: [...st.windows, { id, title: p.title, icon: p.icon, payload: p.payload, dialog: p.dialog, min: false, max: false, z: st.z + 1, ...geo }],
  }));
  return id;
}

function singleKey(w: Win) {
  const p = w.payload;
  if (p.type === "system") return `sys:${p.key}`;
  if (p.type === "app") return `app:${p.app.id}`;
  return undefined;
}

export function openApp(app: AppSpec) {
  return openWindow({ title: app.title, icon: "logo", payload: { type: "app", app }, w: 820, h: 560, single: `app:${app.id}` });
}
export function setStats(winId: string, st: { calls: number; ms: number; offline: boolean }) {
  set((s) => ({ stats: { ...s.stats, [winId]: st } }));
}
export function openSystem(key: SystemKey) {
  const m = SYSTEM_APPS[key];
  return openWindow({ title: m.label, icon: m.icon, payload: { type: "system", key }, w: m.w, h: m.h, single: `sys:${key}` });
}
export function message(title: string, icon: IconName, text: string, detail?: string) {
  return openWindow({ title, icon, payload: { type: "msg", icon, text, detail }, w: 400, h: 190, dialog: true });
}

export function closeWindow(id: string) {
  set((s) => {
    const stats = { ...s.stats };
    delete stats[id];
    return { windows: s.windows.filter((x) => x.id !== id), stats };
  });
}
export function focus(id: string) {
  set((s) => {
    const top = Math.max(0, ...s.windows.map((w) => w.z));
    const w = s.windows.find((x) => x.id === id);
    if (!w || (w.z === top && !w.min)) return {};
    return { z: s.z + 1, windows: s.windows.map((x) => (x.id === id ? { ...x, z: s.z + 1, min: false } : x)) };
  });
}
export function patchWindow(id: string, patch: Partial<Win>) {
  set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
}
export function toggleStart(open?: boolean) {
  set((s) => ({ startOpen: open ?? !s.startOpen }));
}

/* ── Notifications ───────────────────────────────────────── */

let balloonTimer: ReturnType<typeof setTimeout> | undefined;

export function balloon(title: string, text: string) {
  clearTimeout(balloonTimer);
  set(() => ({ balloon: { title, text } }));
  playSound("notify");
  balloonTimer = setTimeout(() => set(() => ({ balloon: null })), 4500);
}
