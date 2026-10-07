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


type State = { bubble: Bubble | null; queue: Bubble[]; mood: Mood; hidden: boolean };

const KEY = "jevos:assistant:v1";
let state: State = { bubble: null, queue: [], mood: "idle", hidden: false };
const listeners = new Set<() => void>();

function set(patch: (s: State) => Partial<State>) {
  state = { ...state, ...patch(state) };
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, JSON.stringify({ hidden: state.hidden }));
  } catch {
    /* private mode */
  }
}

export function hydrateAssistant() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<State>;
    set(() => ({ hidden: !!saved.hidden }));
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
