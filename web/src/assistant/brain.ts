"use client";

import { type AppManifest, SHELL_META } from "@/lib/compose/compose";
import { skeletonBundle } from "@/lib/compose/skeleton";
import { fetchContent } from "@/lib/content/client";
import { dismissInstall, getGenShells, installFor, onShellEvent, refreshShells, setPrefer } from "@/lib/genshell/client";
import { detectProgram } from "@/lib/genshell/detect";
import { getOS, openApp, toggleStart } from "@/os/store";
import { isWelcomeOpen, onWelcomeClosed, setStartQuery } from "@/os/welcomeStore";
import { say, unsay } from "./store";
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

/* ── Windows: every app that opens gets looked at once ── */

const seenWindows = new Set<string>();

export function onWindowsChanged() {
  for (const w of getOS().windows) {
    if (w.payload.type !== "app" || seenWindows.has(w.id)) continue;
    seenWindows.add(w.id);
    void maybeInstallProgram(w.payload.app);
  }
}

/**
 * "tetris but …" and TETRIS.EXE isn't installed: install it in the tray, keep the built-in shell meanwhile.
 * The generator gets the window's real content as its sample (same cached request, no extra Gemini call).
 */
async function maybeInstallProgram(app: AppManifest) {
  const hit = detectProgram(app.prompt);
  if (!hit || getGenShells().shells[hit.label]) return;
  if (!getGenShells().generator) return;
  const sample = await fetchContent(app, 0).catch(() => skeletonBundle(app.shape, app.title));
  installFor(app, sample, "guest", (SHELL_META[app.shell] ?? SHELL_META.explorer).label);
}

/* ── Generated-shell installs ── */

export function watchInstalls() {
  void refreshShells();
  return onShellEvent((e) => {
    if (e.type === "install-started") {
      say({
        id: `install:${e.install.label}`,
        mood: "think",
        title: `${e.install.exe} is not installed`,
        text: `It looks like you want ${e.install.exe}. I opened your app in ${e.install.fallback ?? "Explorer"} compatibility mode for now. Setup is installing ${e.install.exe} in the tray, and I'll tell you when it's ready.`,
        buttons: [{ label: "OK", primary: true }],
      });
    } else if (e.type === "installed") {
      unsay(`install:${e.shell.label}`);
      const app = e.app;
      say({
        id: `installed:${e.shell.label}`,
        mood: "happy",
        title: `${e.shell.exe} is installed!`,
        text: app ? `Want to open ${app.title} in ${e.shell.exe}? From now on anyone who asks for it gets it instantly.` : `Anyone who asks for it now gets it instantly.`,
        buttons: app
          ? [
              {
                label: "Yes",
                primary: true,
                onClick: () => {
                  setPrefer(app.id, true);
                  openApp(app);
                  dismissInstall(e.shell.label);
                },
              },
              { label: "Later", onClick: () => dismissInstall(e.shell.label) },
            ]
          : [{ label: "OK", onClick: () => dismissInstall(e.shell.label) }],
      });
    } else if (e.type === "install-failed") {
      unsay(`install:${e.install.label}`);
      const app = e.app;
      say({
        id: `failed:${e.install.label}:${Date.now()}`,
        mood: "guilty",
        title: "Setup failed",
        text: `Setup was unable to install ${e.install.exe}. ${e.install.error ?? ""}`.trim(),
        buttons: [
          ...(app
            ? [
                {
                  label: "Retry",
                  primary: true,
                  onClick: () => {
                    dismissInstall(e.install.label);
                    void maybeInstallProgram(app);
                  },
                },
              ]
            : []),
          { label: "Cancel", onClick: () => dismissInstall(e.install.label) },
        ],
      });
    }
  });
}
