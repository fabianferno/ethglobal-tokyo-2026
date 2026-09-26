"use client";

import { useSyncExternalStore } from "react";
import type { AppManifest } from "@/lib/compose/compose";
import type { Bundle } from "@/lib/compose/shapes";
import { detectProgram, exeName } from "./detect";
import { SANDBOX, srcdocFor } from "./runtime";
import type { ShellInfo } from "./types";

/**
 * Client side of generated shells: what's installed, what's installing (the tray), per-app choice of
 * generated vs. fallback shell, and the in-browser smoke test that gates publishing.
 */

export type InstallStage = "generating" | "testing" | "retrying" | "publishing" | "done" | "failed";
export type Install = { label: string; name: string; exe: string; stage: InstallStage; startedAt: number; stageAt?: number; error?: string; appId?: string; fallback?: string };

export type ShellEvent =
  | { type: "install-started"; install: Install; app?: AppManifest }
  | { type: "installed"; shell: ShellInfo; app?: AppManifest }
  | { type: "install-failed"; install: Install; app?: AppManifest };

type State = {
  shells: Record<string, ShellInfo>;
  installs: Record<string, Install>;
  /** appId → use the generated shell (true) or keep the fallback (false). Unset = generated when installed. */
  prefer: Record<string, boolean>;
  generator: boolean;
};

const KEY = "suicaos:genshell:v1";
let state: State = { shells: {}, installs: {}, prefer: {}, generator: true };
const listeners = new Set<() => void>();
const eventSubs = new Set<(e: ShellEvent) => void>();

function set(patch: (s: State) => Partial<State>) {
  state = { ...state, ...patch(state) };
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, JSON.stringify({ prefer: state.prefer }));
  } catch {
    /* private mode */
  }
}
const emit = (e: ShellEvent) => eventSubs.forEach((f) => f(e));

export function onShellEvent(f: (e: ShellEvent) => void) {
  eventSubs.add(f);
  return () => void eventSubs.delete(f);
}

export function useGenShells<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
    () => sel(state),
  );
}
export const getGenShells = () => state;

let loaded = false;
export async function refreshShells() {
  if (!loaded) {
    loaded = true;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<State>;
      if (saved.prefer) set(() => ({ prefer: saved.prefer! }));
    } catch {
      /* ignore */
    }
  }
  try {
    const res = await fetch("/api/shells");
    const j = (await res.json()) as { shells: ShellInfo[]; generator: boolean };
    if (!res.ok) return;
    set((s) => ({ shells: { ...s.shells, ...Object.fromEntries(j.shells.map((x) => [x.label, x])) }, generator: j.generator }));
  } catch {
    /* offline: keep what we have */
  }
}

const htmlCache = new Map<string, Promise<string>>();
export function shellHtml(label: string): Promise<string> {
  let p = htmlCache.get(label);
  if (!p) {
    p = fetch(`/api/shells?label=${encodeURIComponent(label)}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "shell unavailable");
      return j.html as string;
    });
    htmlCache.set(label, p);
    p.catch(() => htmlCache.delete(label));
  }
  return p;
}

/** The generated shell this app should render in right now, if any. */
export function generatedFor(app: AppManifest, s: State = state): ShellInfo | null {
  const hit = detectProgram(app.prompt);
  if (!hit) return null;
  const shell = s.shells[hit.label];
  if (!shell) return null;
  return s.prefer[app.id] === false ? null : shell;
}

export function useGeneratedFor(app: AppManifest): ShellInfo | null {
  return useGenShells((s) => generatedFor(app, s));
}

export function setPrefer(appId: string, useGenerated: boolean) {
  set((s) => ({ prefer: { ...s.prefer, [appId]: useGenerated } }));
}

/* ── Smoke test: run the shell in a hidden sandbox with real data before anyone else gets it ── */

export function smokeTest(html: string, bundle: Bundle, app: AppManifest, timeoutMs = 9000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", SANDBOX);
    frame.setAttribute("aria-hidden", "true");
    // On-screen but practically invisible: Chrome pauses requestAnimationFrame in hidden or off-screen
    // cross-origin frames, which would make every game "never draw".
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:640px;height:480px;border:0;opacity:0.01;pointer-events:none;z-index:-1";
    const errors: string[] = [];
    let done = false;
    const finish = (r: { ok: boolean; error?: string }) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      frame.remove();
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || !e.data?.type) return;
      if (e.data.type === "suica:error") errors.push(String(e.data.message));
      if (e.data.type === "suica:ready") {
        // Give it a moment to throw on its first few frames.
        setTimeout(() => {
          if (errors.length) finish({ ok: false, error: `runtime error: ${errors[0]}` });
          else if (!e.data.painted) finish({ ok: false, error: "called ready() but drew nothing" });
          else finish({ ok: true });
        }, 1200);
      }
    };
    const timer = setTimeout(() => finish({ ok: false, error: errors[0] ? `runtime error: ${errors[0]}` : "never called suica.ready() within 9 seconds" }), timeoutMs);
    window.addEventListener("message", onMsg);
    frame.onload = () => frame.contentWindow?.postMessage({ type: "suica:data", bundle, app: { title: app.title, ens: app.ens, target: app.target, prompt: app.prompt, vibe: app.vibe, preview: false } }, "*");
    frame.srcdoc = srcdocFor(html);
    document.body.appendChild(frame);
  });
}

/* ── Install: generate → smoke test (→ one retry) → publish ── */

function patchInstall(label: string, patch: Partial<Install>) {
  set((s) => ({ installs: { ...s.installs, [label]: { ...s.installs[label], ...(patch.stage ? { stageAt: Date.now() } : {}), ...patch } } }));
}

async function generate(name: string, app: AppManifest, bundle: Bundle, installedBy: string, retryError?: string): Promise<ShellInfo> {
  const res = await fetch("/api/shells", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "generate", name, prompt: app.prompt, sample: bundle, installedBy, retryError }),
  });
  const j = await res.json();
  if (!res.ok) throw Object.assign(new Error(j.error ?? "generation failed"), { check: j.check as string | undefined });
  return j.shell as ShellInfo;
}

/**
 * Start installing the program this app's prompt names. The app keeps running in its fallback shell
 * meanwhile; nothing swaps under the person — the assistant asks when it's done.
 */
export function installFor(app: AppManifest, bundle: Bundle, installedBy: string, fallbackLabel: string): Install | null {
  const hit = detectProgram(app.prompt);
  if (!hit) return null;
  if (state.shells[hit.label]) return null;
  const running = state.installs[hit.label];
  if (running && running.stage !== "failed" && running.stage !== "done") return running;

  const install: Install = { label: hit.label, name: hit.name, exe: exeName(hit.name), stage: "generating", startedAt: Date.now(), appId: app.id, fallback: fallbackLabel };
  set((s) => ({ installs: { ...s.installs, [hit.label]: install }, prefer: { ...s.prefer, [app.id]: false } }));
  emit({ type: "install-started", install, app });

  void (async () => {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt) patchInstall(hit.label, { stage: "retrying" });
        const shell = await generate(hit.name, app, bundle, installedBy, attempt ? lastError : undefined);
        patchInstall(hit.label, { stage: "testing" });
        htmlCache.delete(hit.label);
        const html = await shellHtml(hit.label);
        const test = await smokeTest(html, bundle, app);
        if (!test.ok) {
          lastError = test.error ?? "failed the install check";
          continue;
        }
        patchInstall(hit.label, { stage: "publishing" });
        void fetch("/api/shells", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "publish", label: hit.label, sha256: shell.sha256 }) }).catch(() => {});
        set((s) => ({ shells: { ...s.shells, [hit.label]: shell } }));
        patchInstall(hit.label, { stage: "done" });
        emit({ type: "installed", shell, app });
        // The publish (Walrus + ENS) finishes in the background; pick up its ENS name later.
        setTimeout(() => void refreshShells(), 60_000);
        return;
      } catch (e) {
        lastError = (e as { check?: string }).check ?? (e as Error).message;
        // Config / network errors won't get better on a retry.
        if (!(e as { check?: string }).check) break;
      }
    }
    patchInstall(hit.label, { stage: "failed", error: lastError });
    emit({ type: "install-failed", install: { ...install, stage: "failed", error: lastError }, app });
  })();
  return install;
}

export function dismissInstall(label: string) {
  set((s) => ({ installs: Object.fromEntries(Object.entries(s.installs).filter(([k]) => k !== label)) }));
}
