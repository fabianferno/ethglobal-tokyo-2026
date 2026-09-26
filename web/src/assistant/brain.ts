"use client";

import { type AppManifest, buildBundle, newId, SHELL_META } from "@/lib/compose/compose";
import type { Bundle } from "@/lib/compose/shapes";
import { dismissInstall, getGenShells, installFor, onShellEvent, refreshShells, setPrefer } from "@/lib/genshell/client";
import { detectProgram } from "@/lib/genshell/detect";
import { fetchRealPortfolio, isRealWallet, liveBundleFor } from "@/lib/portfolio/live";
import { getOS, openApp, openSystem, recordActivity, toggleStart } from "@/os/store";
import { runAction } from "@/shells/AppFrame";
import { isWelcomeOpen, onWelcomeClosed } from "@/os/welcomeStore";
import { capRoom, dismiss, getAssistant, say, setCap, setMood, spend, unsay } from "./store";

/**
 * When the assistant speaks. Deliberately few triggers, each gated by a threshold in code (not a
 * prompt), so it interrupts only when it's sure and it's worth it. Every line is a template filled
 * with real numbers; there is no free-text generation anywhere in here.
 */

const JPY_PER_USD = 150;
const usd = (v: number) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });

/** Only interrupt about losses this big (confidence + worth-it gate). */
const LOSS_ALERT_USD = 500;
const LOSS_ALERT_PCT = -25;

const said = new Set<string>();
const once = (key: string) => (said.has(key) ? false : (said.add(key), true));
/** Like once(), but survives reloads for this browser session: an interruption is never repeated. */
function onceThisSession(key: string) {
  if (!once(key)) return false;
  try {
    const k = `suicaos:said:${key}`;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, "1");
  } catch {
    /* ignore */
  }
  return true;
}

/* ── Boot ── */

export function greet(user: string) {
  // The Welcome dialog explains the OS first; Tappy says hi once it's closed.
  if (isWelcomeOpen()) {
    const off = onWelcomeClosed(() => (off(), setTimeout(() => greet(user), 700)));
    return;
  }
  if (!once(`greet:${user}`)) return;
  try {
    if (sessionStorage.getItem("suicaos:greeted") === user) return;
    sessionStorage.setItem("suicaos:greeted", user);
  } catch {
    /* ignore */
  }
  say({
    id: "greet",
    mood: "wave",
    title: "Hi, I'm Tappy!",
    text: "I'm the agent in this OS. I watch your apps, act within the limits you give me, and only pop up when something needs you. It looks like you're about to make an app. Want to open Start?",
    buttons: [
      { label: "Open Start", primary: true, onClick: () => toggleStart(true) },
      { label: "Got it" },
    ],
  });
}

/* ── Windows: every app that opens gets looked at once ── */

const seenWindows = new Set<string>();

export function onWindowsChanged() {
  for (const w of getOS().windows) {
    if (w.payload.type !== "app" || seenWindows.has(w.id)) continue;
    seenWindows.add(w.id);
    const app = w.payload.app;
    void maybeInstallProgram(app);
    void maybeLossAlert(app);
    maybeOfferTab(app);
  }
}

async function bundleFor(app: AppManifest): Promise<Bundle> {
  const base = buildBundle(app);
  return (await liveBundleFor(app, base)) ?? base;
}

/** "tetris but …" and TETRIS.EXE isn't installed: install it in the tray, keep the built-in shell meanwhile. */
async function maybeInstallProgram(app: AppManifest) {
  const hit = detectProgram(app.prompt);
  if (!hit || getGenShells().shells[hit.label]) return;
  if (!getGenShells().generator) return;
  installFor(app, await bundleFor(app), getOS().suiAddress ?? getOS().user ?? "guest", (SHELL_META[app.shell] ?? SHELL_META.explorer).label);
}

/** A real wallet with a big 30-day loser: offer to shoot it. */
async function maybeLossAlert(app: AppManifest) {
  if (!isRealWallet(app.target) || app.shell === "doom" || !["portfolio", "roast"].includes(app.fn)) return;
  if (!onceThisSession(`loss:${app.target}`)) return;
  try {
    const p = await fetchRealPortfolio(app.target);
    const worst = [...p.holdings].filter((h) => h.change30d !== null).sort((a, b) => a.pnl30d - b.pnl30d)[0];
    if (!worst || worst.pnl30d > -LOSS_ALERT_USD || (worst.change30d ?? 0) > LOSS_ALERT_PCT) return;
    say({
      id: `loss:${app.target}`,
      title: "Ouch.",
      text: `It looks like ${worst.token} in ${app.target} is down ${Math.abs(worst.change30d ?? 0).toFixed(0)}% this month (${usd(worst.pnl30d)}). Want to shoot the losses in DOOM?`,
      buttons: [
        {
          label: "Yes, rip and tear",
          primary: true,
          onClick: () => openApp({ ...app, id: newId(), fn: "portfolio", shell: "doom", icon: SHELL_META.doom.icon, title: `Doom · Losses — ${app.target}`, prompt: `doom but I'm shooting ${app.target}'s losses` }),
        },
        { label: "No thanks" },
      ],
    });
  } catch {
    /* no real data → nothing to say */
  }
}

/* ── Group Tab: the agent part. Offer a cap once, then act within it. ── */

function maybeOfferTab(app: AppManifest) {
  if (app.fn !== "split" || app.readOnly) return;
  if (getAssistant().caps[app.ens] || !onceThisSession(`tab:${app.ens}`)) return;
  say({
    id: `tab:${app.ens}`,
    title: app.title,
    text: "Want me to handle this tab for you? I'll settle up when everyone's in.",
    choices: [
      { id: "5000", label: "Up to ¥5,000 a day" },
      { id: "15000", label: "Up to ¥15,000 a day" },
      { id: "ask", label: "Always ask me" },
    ],
    defaultChoice: "5000",
    buttons: [
      {
        label: "OK",
        primary: true,
        onClick: (choice) => {
          if (!choice || choice === "ask") {
            setCap(app.ens, { mode: "ask", perDayUsd: 0, label: "always ask" });
            return;
          }
          const yen = Number(choice);
          setCap(app.ens, { mode: "auto", perDayUsd: yen / JPY_PER_USD, label: `¥${yen.toLocaleString()}/day` });
          setTimeout(() => settleIfReady(app), 1500);
        },
      },
      { label: "Cancel" },
    ],
  });
}

/**
 * Level 1: within cap → act, then tell. Level 2: over cap (or real money before auto-sign exists) →
 * ask, through the fixed Signing dialog. Level 3 (tries anyway → Move abort → BSOD) is the chain's job.
 */
export function settleIfReady(app: AppManifest) {
  const bundle = buildBundle(app);
  const settle = bundle.actions.find((a) => a.id === "settle");
  if (!settle?.tx) return;
  const members = bundle.table?.rows.length ?? 0;
  const amount = settle.tx.amount;
  const room = capRoom(app.ens);
  const real = !!getOS().suiAddress;

  if (real) {
    // Real Sui: the no-dialog path (autoExecuteSui, AgentCap-gated) isn't live yet, so level 2.
    say({ id: `settle:${app.ens}`, mood: "think", title: "Everyone's in", text: `I've prepared the settle-up for ${app.title}: ${members} members, ${usd(amount)} in one sponsored transaction. Approve it and I'll send it.`, buttons: [{ label: "Review", primary: true, onClick: () => runAction(settle, app) }, { label: "Later" }] });
    return;
  }
  if (amount <= room) {
    spend(app.ens, amount);
    recordActivity({ agent: app.ens, kind: "Settle group (auto)", amount, token: "USDC", status: "ok" });
    setMood("happy");
    say({ id: `settled:${app.ens}:${Date.now()}`, mood: "happy", title: "Done!", text: `I settled ${app.title}: ${usd(amount)} to ${members - 1} friends in one sponsored transaction. That's within the ${getAssistant().caps[app.ens]?.label} you gave me. (paper mode)`, buttons: [{ label: "View in Task Manager", onClick: () => openSystem("taskmgr") }, { label: "Nice" }] });
    return;
  }
  say({
    id: `ask:${app.ens}`,
    mood: "think",
    title: "Over my limit",
    text: `Settling ${app.title} needs ${usd(amount)}, but you gave me ${usd(room)} left for today. Want to approve it yourself?`,
    buttons: [{ label: "Review", primary: true, onClick: () => runAction(settle, app) }, { label: "Not now" }],
  });
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

/* ── Crashes: the chain said no ── */

let lastBsod: string | null = null;
export function onBsodChanged() {
  const b = getOS().bsod;
  if (b) {
    lastBsod = b.agent;
    setMood("guilty");
    return;
  }
  if (!lastBsod) return;
  const agent = lastBsod;
  lastBsod = null;
  dismiss();
  say({
    id: `bsod:${Date.now()}`,
    mood: "guilty",
    title: "That was me. Sorry.",
    text: `${agent} tried to move more than its AgentCap allows. The Move contract rejected it on-chain, so no funds moved. I've frozen that agent until you review it.`,
    buttons: [{ label: "OK", primary: true, onClick: () => setMood("idle") }],
  });
}
