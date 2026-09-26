"use client";

import { useSyncExternalStore } from "react";
import { playSound } from "@/os/sounds";

/**
 * The OS assistant ("Tappy"): one Clippy-style agent for the whole OS. It never writes free text —
 * every line is a template filled with real numbers, it speaks only in balloons with buttons, and it
 * stays quiet unless a trigger clears a confidence threshold (Lumière, the brain Clippy never shipped).
 */

export type Mood = "idle" | "talk" | "think" | "happy" | "guilty" | "wave";
export type Choice = { id: string; label: string };
export type Button = { label: string; primary?: boolean; onClick?: (choice: string | null) => void };
export type Bubble = { id: string; title?: string; text: string; choices?: Choice[]; defaultChoice?: string; buttons: Button[]; mood?: Mood };

/** The spend policy the owner gave the assistant for one app (mirrors the on-chain AgentCap). */
export type Cap = { mode: "auto" | "ask"; perDayUsd: number; label: string; spentUsd: number; day: string };

type State = { bubble: Bubble | null; queue: Bubble[]; mood: Mood; hidden: boolean; caps: Record<string, Cap> };

const KEY = "suicaos:assistant:v1";
let state: State = { bubble: null, queue: [], mood: "idle", hidden: false, caps: {} };
const listeners = new Set<() => void>();

function set(patch: (s: State) => Partial<State>) {
  state = { ...state, ...patch(state) };
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, JSON.stringify({ hidden: state.hidden, caps: state.caps }));
  } catch {
    /* private mode */
  }
}

export function hydrateAssistant() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<State>;
    set(() => ({ hidden: !!saved.hidden, caps: saved.caps ?? {} }));
  } catch {
    /* ignore */
  }
}

export function useAssistant<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
    () => sel(state),
  );
}
export const getAssistant = () => state;

let seq = 0;
/** Queue a balloon. `id` dedupes: the same balloon is never shown twice at once. */
export function say(b: Omit<Bubble, "id"> & { id?: string }) {
  const bubble: Bubble = { ...b, id: b.id ?? `b${seq++}` };
  const before = state.bubble;
  set((s) => {
    if (s.bubble?.id === bubble.id || s.queue.some((q) => q.id === bubble.id)) return {};
    if (!s.bubble) return { bubble, mood: bubble.mood ?? "talk", hidden: false };
    return { queue: [...s.queue, bubble] };
  });
  if (!before && state.bubble) playSound("notify");
}

/** Withdraw a balloon that's no longer true (e.g. "not installed" once it is). */
export function unsay(id: string) {
  if (state.bubble?.id === id) return dismiss();
  set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }));
}

/** Close the current balloon and show the next one. */
export function dismiss() {
  set((s) => {
    const [next, ...rest] = s.queue;
    return { bubble: next ?? null, queue: rest, mood: next ? (next.mood ?? "talk") : s.mood === "guilty" ? "guilty" : "idle" };
  });
  if (state.bubble) playSound("notify");
}

export function setMood(mood: Mood) {
  set(() => ({ mood }));
}
export function setHidden(hidden: boolean) {
  set(() => ({ hidden, ...(hidden ? { bubble: null, queue: [] } : {}) }));
}

const today = () => new Date().toISOString().slice(0, 10);

export function setCap(ens: string, cap: Omit<Cap, "spentUsd" | "day">) {
  set((s) => ({ caps: { ...s.caps, [ens]: { ...cap, spentUsd: 0, day: today() } } }));
}
export function clearCap(ens: string) {
  set((s) => ({ caps: Object.fromEntries(Object.entries(s.caps).filter(([k]) => k !== ens)) }));
}

/** Room left under today's cap (resets daily, like the AgentCap's per-day limit). */
export function capRoom(ens: string): number {
  const c = state.caps[ens];
  if (!c || c.mode !== "auto") return 0;
  return c.day === today() ? c.perDayUsd - c.spentUsd : c.perDayUsd;
}
export function spend(ens: string, usd: number) {
  set((s) => {
    const c = s.caps[ens];
    if (!c) return {};
    const spent = c.day === today() ? c.spentUsd : 0;
    return { caps: { ...s.caps, [ens]: { ...c, spentUsd: spent + usd, day: today() } } };
  });
}
