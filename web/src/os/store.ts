"use client";

import { useSyncExternalStore } from "react";
import type { IconName } from "@/components/win99/Icon";
import { fakeDigest } from "@/lib/chain/mock";
import { type AppManifest, newId } from "@/lib/compose/compose";
import type { TxProposal } from "@/lib/compose/shapes";

export type SystemKey = "mycomputer" | "taskmgr" | "network" | "recycle" | "kit";

export const SYSTEM_APPS: Record<SystemKey, { label: string; icon: IconName; w: number; h: number }> = {
  mycomputer: { label: "My Computer", icon: "computer", w: 640, h: 420 },
  taskmgr: { label: "Task Manager", icon: "task", w: 700, h: 470 },
  network: { label: "Network Neighborhood", icon: "network", w: 700, h: 460 },
  recycle: { label: "Recycle Bin", icon: "recycle", w: 520, h: 340 },
  kit: { label: "UI Kit", icon: "logo", w: 760, h: 520 },
};

type Base = { id: string; x: number; y: number; parent: string | null };
export type DesktopItem =
  | (Base & { kind: "system"; system: SystemKey })
  | (Base & { kind: "app"; app: AppManifest })
  | (Base & { kind: "folder"; name: string; ens: string });

export type WinPayload =
  | { type: "app"; app: AppManifest }
  | { type: "system"; key: SystemKey }
  | { type: "folder"; folderId: string }
  | { type: "sign"; tx: TxProposal; reqId: string }
  | { type: "msg"; icon: IconName; text: string; detail?: string }
  | { type: "saveas"; app: AppManifest }
  | { type: "newfolder" };

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

export type Activity = { t: number; agent: string; kind: string; amount: number; token: string; status: "ok" | "denied" | "blocked"; digest?: string };

export type OSState = {
  user: string | null;
  items: DesktopItem[];
  windows: Win[];
  z: number;
  startOpen: boolean;
  bsod: { code: string; agent: string; detail: string } | null;
  balloon: { title: string; text: string } | null;
  activity: Activity[];
  trash: DesktopItem[];
  hydrated: boolean;
};

const KEY = "agentos99:v1";

const initial: OSState = { user: null, items: [], windows: [], z: 10, startOpen: false, bsod: null, balloon: null, activity: [], trash: [], hydrated: false };

let state: OSState = initial;
const listeners = new Set<() => void>();

function set(fn: (s: OSState) => Partial<OSState>) {
  state = { ...state, ...fn(state) };
  listeners.forEach((l) => l());
  persist();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ user: state.user, items: state.items, activity: state.activity.slice(0, 50), trash: state.trash }));
  } catch {
    /* private mode — the OS still works, it just forgets on reload */
  }
}

export function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<OSState>;
      state = { ...state, ...saved };
    }
  } catch {
    /* ignore */
  }
  state = { ...state, hydrated: true };
  listeners.forEach((l) => l());
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

const GRID_X = 100;
const GRID_Y = 96;

function freeSlot(items: DesktopItem[], parent: string | null) {
  const taken = new Set(items.filter((i) => i.parent === parent).map((i) => `${Math.round(i.x / GRID_X)}:${Math.round(i.y / GRID_Y)}`));
  const rows = Math.max(4, Math.floor((typeof window !== "undefined" ? window.innerHeight - 60 : 700) / GRID_Y));
  for (let c = 0; c < 30; c++)
    for (let r = 0; r < rows; r++) if (!taken.has(`${c}:${r}`)) return { x: 8 + c * GRID_X, y: 8 + r * GRID_Y };
  return { x: 8, y: 8 };
}

export function login(user: string) {
  const name = user.trim().toLowerCase().replace(/\s+/g, "") || "guest.eth";
  const ens = name.endsWith(".eth") ? name : `${name}.eth`;
  set((s) => {
    if (s.items.length && s.user === ens) return { user: ens };
    const sys: DesktopItem[] = (["mycomputer", "network", "taskmgr", "recycle", "kit"] as SystemKey[]).map((k, i) => ({ id: `sys_${k}`, kind: "system", system: k, parent: null, x: 8, y: 8 + i * GRID_Y }));
    const team: DesktopItem = { id: newId("fld"), kind: "folder", name: "team", ens: `team.${ens}`, parent: null, x: 8 + GRID_X, y: 8 };
    return { user: ens, items: [...sys, team], windows: [], activity: [], trash: [] };
  });
}

export function logout() {
  set(() => ({ user: null, windows: [], startOpen: false }));
}

export function installApp(app: AppManifest, parent: string | null = null): DesktopItem {
  const s = getOS();
  const folder = parent ? s.items.find((i) => i.id === parent && i.kind === "folder") : undefined;
  const label = app.ens.split(".")[0];
  const ens = folder && folder.kind === "folder" ? `${label}.${folder.ens}` : app.ens;
  const item: DesktopItem = { id: newId("itm"), kind: "app", app: { ...app, ens }, parent, ...freeSlot(s.items, parent) };
  set((st) => ({ items: [...st.items, item] }));
  return item;
}

export function updateApp(itemId: string, patch: Partial<AppManifest>) {
  set((s) => ({
    items: s.items.map((i) => (i.id === itemId && i.kind === "app" ? { ...i, app: { ...i.app, ...patch } } : i)),
    windows: s.windows.map((w) => (w.payload.type === "app" && w.payload.app.id === (s.items.find((i) => i.id === itemId) as { app?: AppManifest })?.app?.id ? { ...w, payload: { type: "app", app: { ...w.payload.app, ...patch } } } : w)),
  }));
}

export function newFolder(name: string) {
  const s = getOS();
  const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, "") || "folder";
  const item: DesktopItem = { id: newId("fld"), kind: "folder", name: clean, ens: `${clean}.${s.user}`, parent: null, ...freeSlot(s.items, null) };
  set((st) => ({ items: [...st.items, item] }));
}

export function moveItem(id: string, x: number, y: number) {
  set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, x: Math.max(0, x), y: Math.max(0, y) } : i)) }));
}

/** Dropping an app on a folder re-roots its ENS name under the folder: grouptab.disha.eth → grouptab.team.disha.eth */
export function moveIntoFolder(itemId: string, folderId: string | null) {
  set((s) => {
    const folder = folderId ? s.items.find((i) => i.id === folderId && i.kind === "folder") : null;
    const slot = freeSlot(s.items, folderId);
    return {
      items: s.items.map((i) => {
        if (i.id !== itemId || i.kind !== "app") return i;
        const label = i.app.ens.split(".")[0];
        const ens = folder && folder.kind === "folder" ? `${label}.${folder.ens}` : `${label}.${s.user}`;
        return { ...i, parent: folderId, ...slot, app: { ...i.app, ens } };
      }),
    };
  });
  const folder = folderId ? getOS().items.find((i) => i.id === folderId) : null;
  if (folder && folder.kind === "folder") balloon("Moved to workspace", `Now inherits ${folder.ens}'s spend policy.`);
}

export function trashItem(id: string) {
  set((s) => {
    const it = s.items.find((i) => i.id === id);
    if (!it || it.kind === "system") return {};
    const ids = new Set([id, ...s.items.filter((i) => i.parent === id).map((i) => i.id)]);
    return { items: s.items.filter((i) => !ids.has(i.id)), trash: [...s.trash, ...s.items.filter((i) => ids.has(i.id))], windows: s.windows.filter((w) => !(w.payload.type === "folder" && w.payload.folderId === id)) };
  });
}

export function emptyTrash() {
  set(() => ({ trash: [] }));
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
  if (p.type === "folder") return `fld:${p.folderId}`;
  if (p.type === "app") return `app:${p.app.id}`;
  return undefined;
}

export function openApp(app: AppManifest) {
  const big = app.shell === "excel" || app.shell === "paint" || app.shell === "explorer";
  return openWindow({ title: `${app.title} — ${app.ens}`, icon: app.icon, payload: { type: "app", app }, w: big ? 820 : 640, h: big ? 560 : 520, single: `app:${app.id}` });
}
export function openSystem(key: SystemKey) {
  const m = SYSTEM_APPS[key];
  return openWindow({ title: m.label, icon: m.icon, payload: { type: "system", key }, w: m.w, h: m.h, single: `sys:${key}` });
}
export function openFolder(folderId: string) {
  const f = getOS().items.find((i) => i.id === folderId);
  if (!f || f.kind !== "folder") return;
  return openWindow({ title: f.ens, icon: "folder", payload: { type: "folder", folderId }, w: 620, h: 400, single: `fld:${folderId}` });
}
export function message(title: string, icon: IconName, text: string, detail?: string) {
  return openWindow({ title, icon, payload: { type: "msg", icon, text, detail }, w: 400, h: 190, dialog: true });
}

export function closeWindow(id: string) {
  const w = getOS().windows.find((x) => x.id === id);
  if (w?.payload.type === "sign") resolveSign(w.payload.reqId, false);
  set((s) => ({ windows: s.windows.filter((x) => x.id !== id) }));
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

/* ── Signing: the one fixed, never-generated surface that can move money ── */

const pending = new Map<string, (ok: boolean) => void>();

export function requestSignature(tx: TxProposal): Promise<boolean> {
  const reqId = newId("sig");
  return new Promise((resolve) => {
    pending.set(reqId, resolve);
    openWindow({ title: "Confirm Transaction", icon: "lock", payload: { type: "sign", tx, reqId }, w: 480, h: 470, dialog: true });
  });
}

export function resolveSign(reqId: string, ok: boolean) {
  const fn = pending.get(reqId);
  if (!fn) return;
  pending.delete(reqId);
  fn(ok);
}

export function recordActivity(a: Omit<Activity, "t" | "digest"> & { digest?: string }) {
  set((s) => ({ activity: [{ ...a, t: Date.now(), digest: a.digest ?? (a.status === "ok" ? fakeDigest() : undefined) }, ...s.activity].slice(0, 100) }));
}

/** Propose → sign → record. Returns the digest on success. */
export async function propose(tx: TxProposal): Promise<string | null> {
  const ok = await requestSignature(tx);
  if (!ok) {
    recordActivity({ agent: tx.agent, kind: tx.kind, amount: tx.amount, token: tx.token, status: "denied" });
    return null;
  }
  const digest = fakeDigest();
  recordActivity({ agent: tx.agent, kind: tx.kind, amount: tx.amount, token: tx.token, status: "ok", digest });
  balloon("Transaction sent", `${tx.kind} · ${tx.amount ? `${tx.amount} ${tx.token}` : ""}\n${digest.slice(0, 10)}…`);
  return digest;
}

/* ── Notifications & crashes ─────────────────────────────── */

let balloonTimer: ReturnType<typeof setTimeout> | undefined;
export function balloon(title: string, text: string) {
  clearTimeout(balloonTimer);
  set(() => ({ balloon: { title, text } }));
  balloonTimer = setTimeout(() => set(() => ({ balloon: null })), 4500);
}

export function bsod(agent: string, code = "AGENT_SPEND_LIMIT_EXCEEDED", detail = "") {
  recordActivity({ agent, kind: code, amount: 0, token: "", status: "blocked" });
  set(() => ({ bsod: { agent, code, detail }, startOpen: false }));
}
export function clearBsod() {
  set(() => ({ bsod: null }));
}
