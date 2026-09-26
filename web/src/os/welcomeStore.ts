"use client";

import { useSyncExternalStore } from "react";

/**
 * The Welcome dialog is the landing page: there is no marketing site, so first-time visitors learn
 * what Suica OS is right after it boots. Shown once per browser (unless "Show at startup" stays on),
 * reopenable from search ("what is this"), the Start menu and Tappy.
 */

const KEY = "suicaos:welcome:v1";
let open = false;
const listeners = new Set<() => void>();
const closedSubs = new Set<() => void>();
/** A query the Start menu should open with (the Welcome dialog's "Try it" buttons). */
let startQuery = "";

const emit = () => listeners.forEach((l) => l());

export function useWelcomeOpen() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => open,
    () => false,
  );
}
export const isWelcomeOpen = () => open;

/** First boot in this browser (or the person left "Show at startup" checked). */
export function shouldShowAtStartup() {
  try {
    return localStorage.getItem(KEY) !== "hide";
  } catch {
    return true;
  }
}
export function setShowAtStartup(show: boolean) {
  try {
    localStorage.setItem(KEY, show ? "show" : "hide");
  } catch {
    /* private mode */
  }
}

export function openWelcome() {
  open = true;
  emit();
}
export function closeWelcome() {
  open = false;
  emit();
  closedSubs.forEach((f) => f());
}
export function onWelcomeClosed(f: () => void) {
  closedSubs.add(f);
  return () => void closedSubs.delete(f);
}

export function setStartQuery(q: string) {
  startQuery = q;
}
/** Read once by the Start menu when it mounts. */
export function takeStartQuery() {
  const q = startQuery;
  startQuery = "";
  return q;
}
