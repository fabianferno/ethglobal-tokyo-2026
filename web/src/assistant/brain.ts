"use client";

import { getOS, toggleStart } from "@/os/store";
import { isWelcomeOpen, onWelcomeClosed, setStartQuery } from "@/os/welcomeStore";
import { say } from "./store";
import { pickSuggestion } from "./suggest";

/**
 * When Tappy speaks. Deliberately few triggers, each gated in code (not a prompt), so it interrupts
 * only when it's worth it. Every line is a fixed template; there is no free-text generation in here.
 */

const said = new Set<string>();
const once = (key: string) => (said.has(key) ? false : (said.add(key), true));
/** Like once(), but survives reloads for this browser session: an interruption is never repeated. */
function onceThisSession(key: string) {
  if (!once(key)) return false;
  try {
    const k = `jevos:said:${key}`;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, "1");
  } catch {
    /* ignore */
  }
  return true;
}

/* ── Boot ── */

export function greet() {
  // The Welcome dialog explains the OS first; Tappy says hi once it's closed.
  if (isWelcomeOpen()) {
    const off = onWelcomeClosed(() => (off(), setTimeout(greet, 700)));
    return;
  }
  if (!onceThisSession("greet")) return;
  say({
    id: "greet",
    mood: "wave",
    title: "Hi, I'm Tappy",
    text: "Nothing on this desktop is installed. Type anything in Start and Jev builds the app while you type.",
    buttons: [
      { label: "Open Start", primary: true, onClick: () => toggleStart(true) },
      { label: "Later" },
    ],
  });
}

/* ── Idle: one prompt idea per session, only on an empty desktop ── */

const suggested = new Set<string>();

export function suggestWhenIdle() {
  if (getOS().windows.some((w) => w.payload.type === "app") || getOS().startOpen || isWelcomeOpen()) return;
  if (!onceThisSession("suggest")) return;
  const q = pickSuggestion(suggested);
  if (!q) return;
  suggested.add(q);
  say({
    id: "suggest",
    mood: "think",
    title: "Need an idea?",
    text: `Try typing: "${q}"`,
    buttons: [
      {
        label: "Try it",
        primary: true,
        onClick: () => {
          setStartQuery(q);
          toggleStart(true);
        },
      },
      { label: "No thanks" },
    ],
  });
}
