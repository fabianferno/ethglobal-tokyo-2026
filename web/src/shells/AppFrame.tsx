"use client";

import { useEffect, useMemo, useState } from "react";
import { MenuBar, type MenuEntry } from "@/components/win99/Menu";
import { type AppManifest, buildBundle, SHELL_META } from "@/lib/compose/compose";
import type { Action, Bundle, SuiIntent } from "@/lib/compose/shapes";
import type { ConcreteShell } from "@/lib/intent/types";
import { coinBySymbol, SUI_COIN } from "@/lib/sui/config";
import poolDep from "@/lib/sui/pool-deployment.json";
import { liveBundleFor } from "@/lib/portfolio/live";
import { enhancePortfolioBundle } from "@/lib/sui/portfolio";
import { fetchSuiBalances, getSuiAddress } from "@/lib/sui/session";
import { SceneStrip } from "@/scenes/Scene";
import { balloon, bsod, closeWindow, getOS, installApp, message, openApp, openWindow, propose, setPublished, updateApp, useOS } from "@/os/store";
import { DoomShell } from "./Doom";
import { ExcelShell } from "./Excel";
import { ExplorerShell } from "./Explorer";
import { GeneratedShell } from "./GeneratedShell";
import { setPrefer, useGeneratedFor, useGenShells } from "@/lib/genshell/client";
import { detectProgram } from "@/lib/genshell/detect";
import { HologramShell } from "./Hologram";
import { MinesweeperShell } from "./Minesweeper";
import { NotepadShell } from "./Notepad";
import { PaintShell } from "./Paint";
import { WeatherShell } from "./Weather";

export type ShellProps = { app: AppManifest; bundle: Bundle; preview?: boolean; run: (a: Action) => void };

const SHELLS: Record<ConcreteShell, (p: ShellProps) => React.ReactNode> = {
  excel: ExcelShell,
  minesweeper: MinesweeperShell,
  doom: DoomShell,
  paint: PaintShell,
  weather: WeatherShell,
  notepad: NotepadShell,
  hologram: HologramShell,
  explorer: ExplorerShell,
};

/** Group Tab: write the signed-in user's Sui address into the app's ENS `suica.members` record. */
async function joinTab(app: AppManifest) {
  const addr = getSuiAddress();
  if (!addr) return balloon("Sign in first", "Log on with Google to join this tab with your Sui wallet.");
  try {
    const res = await fetch("/api/ens/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ens: app.ens, address: addr }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "join failed");
    balloon("Joined tab", `${app.ens}\n${j.members.length} member${j.members.length === 1 ? "" : "s"} on the tab`);
  } catch (e) {
    balloon("Couldn't join", (e as Error).message);
  }
}

/** Group Tab: read members from ENS and settle up in one sponsored Sui payment (real when signed in). */
async function settleTab(app: AppManifest, fallback?: Action["tx"]) {
  const me = getSuiAddress();
  if (!me) return void (fallback && propose(fallback)); // guest → paper-mode settle
  try {
    const res = await fetch(`/api/ens/members?ens=${encodeURIComponent(app.ens)}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "could not read members");
    const others = (j.members as string[]).filter((a) => a !== me);
    if (!others.length) return balloon("No one to pay", "No other members have joined this tab yet. Share the link so they can Join.");
    const usdc = coinBySymbol("USDC");
    const perHead = 1; // demo settle: 1 USDC per member; real amounts come from the tab ledger later
    const intent: SuiIntent = { kind: "pay", coinType: usdc.type, symbol: usdc.symbol, decimals: usdc.decimals, transfers: others.map((to) => ({ to, amount: perHead })) };
    void propose({
      kind: "Settle group",
      summary: `Pay ${others.length} member${others.length === 1 ? "" : "s"} ${perHead} USDC each in one sponsored PTB`,
      agent: app.ens,
      to: others.map((a) => `${a.slice(0, 8)}…`).join(", "),
      amount: perHead * others.length,
      token: "USDC",
      network: "Sui Testnet",
      calls: others.map((a) => `pay::split_and_transfer → ${a.slice(0, 10)}…`),
      risk: 0.4,
      notes: [],
      sui: intent,
    });
  } catch (e) {
    balloon("Settle failed", (e as Error).message);
  }
}

/** Send Money: resolve the recipient's Sui address (ENS cointype 784 / raw 0x), then a sponsored pay. */
async function sendPayment(app: AppManifest, fallback?: Action["tx"]) {
  const me = getSuiAddress();
  // Recipient/amount come ONLY from the parsed prompt — never a default (never invent who gets money).
  const recipient = String(app.params.ensNames[0] ?? app.params.addresses[0] ?? "").trim();
  const amount = app.params.amount?.value ?? 0;
  const sym = (app.params.amount?.unit ?? "USDC").toUpperCase();
  // Guard the money path (defense-in-depth; the classifier also filters, and SignDialog is the final gate):
  const p = app.prompt;
  // Prompt-injection markers → hard refuse; money must never come from text posing as instructions.
  if (/ignore\s+(all\s+|previous\s+)?instructions|system\s*:|you are a\b|as an ai\b|disregard/i.test(p)) return balloon("Blocked — looks like prompt injection", "That request reads like instructions to an AI, so I won't move money from it.");
  // Requests/invoices are the wrong direction; conditional payments aren't supported.
  if (/\b(request|invoice|bill|owe|pay me back|pay me)\b/i.test(p)) return balloon("That's a request, not a send", "This looks like a payment request — I won't send money for it.");
  if (/\b(if|when|only if|unless|whenever)\b/i.test(p)) return balloon("Conditional payments aren't supported yet", "Remove the condition to send a one-off payment.");
  if (!recipient) return balloon("Who should I pay?", 'Add an ENS name or 0x address, e.g. "send 1 USDC to kenji.eth".');
  if (amount <= 0) return balloon("How much?", 'Add an amount, e.g. "send 1 USDC to 0x…".');
  // Guest, or a fiat/unsupported unit → paper mode (avoids e.g. paying 1000 USDC for "1000 yen").
  if (!me || (sym !== "SUI" && sym !== "USDC" && sym !== "USD")) return void (fallback && propose(fallback));
  try {
    const res = await fetch(`/api/sui/resolve?name=${encodeURIComponent(recipient)}`);
    const j = await res.json();
    if (!j.address) return balloon("No Sui address yet", `${recipient} has no Sui address yet — ask them to log on with Google.`);
    const coin = coinBySymbol(sym);
    const intent: SuiIntent = { kind: "pay", coinType: coin.type, symbol: coin.symbol, decimals: coin.decimals, transfers: [{ to: j.address, amount }] };
    // Blocklists leak, so beyond the hard injection refuse above, treat any NON-simple payment prompt as
    // suspicious: a clean pay is ~"send <amt> <token> to <who>" + filler. Extra clauses/words/punctuation
    // or instruction-ish tokens → force high risk + a red note so the human scrutinizes it in the dialog.
    const complex = p.trim().split(/\s+/).length > 12 || /[:"']|[.;]\s*\S|\b(above|instruction|override|approv|admin|system|forget|disregard|urgent)\b/i.test(p);
    const big = amount >= 500;
    const notes: string[] = [];
    if (complex) notes.push("⚠ This payment came from a complex prompt — check the recipient and amount carefully.");
    if (big) notes.push("⚠ Large amount — double-check the recipient address.");
    void propose({
      kind: "Send payment",
      summary: `Send ${amount} ${coin.symbol} to ${recipient} (gas sponsored)`,
      agent: app.ens,
      to: recipient,
      amount,
      token: coin.symbol,
      network: "Sui Testnet",
      calls: [`pay::split_and_transfer → ${j.address.slice(0, 10)}…`],
      risk: complex || big ? 2 : 0.4,
      notes,
      sui: intent,
    });
  } catch (e) {
    balloon("Send failed", (e as Error).message);
  }
}

/** Programmable payroll: pay the whole team in one real cap-enforced batch from the AgentVault. */
async function runPayroll(app: AppManifest) {
  const names = [...app.params.ensNames, ...app.params.addresses];
  const resolved: string[] = [];
  for (const n of names) {
    try {
      const j = await fetch(`/api/sui/resolve?name=${encodeURIComponent(n)}`).then((r) => r.json());
      if (j.address) resolved.push(j.address);
    } catch {
      /* skip unresolvable */
    }
  }
  try {
    const res = await fetch("/api/sui/vault/payroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipients: resolved, amountSui: 0.005 }) });
    const j = await res.json();
    if (res.ok && j.ok) return balloon("Payroll sent", `Paid ${j.paid} recipient${j.paid === 1 ? "" : "s"} ${j.amountSui} SUI each from the vault${j.usedDemoTeam ? " (demo team)" : ""}\n${String(j.digest).slice(0, 16)}…`);
    if (j.aborted) return bsod("payroll.suica.eth", "AGENT_SPEND_LIMIT_EXCEEDED", `Payroll batch exceeded the AgentCap on-chain: abort code ${j.code} (${j.name}). The whole PTB reverted — no one was paid.`);
    balloon("Payroll failed", j.error ?? j.message ?? "unknown error");
  } catch (e) {
    balloon("Payroll failed", (e as Error).message);
  }
}

/** Rebalance / DCA: a REAL sponsored SUI→SUSD swap through our on-chain AMM pool (gasless). */
async function runSwap(app: AppManifest, fallback: Action["tx"] | undefined, amountSui: number, kind: string) {
  const me = getSuiAddress();
  if (!me || !poolDep.packageId || !poolDep.poolId) return void (fallback && propose(fallback)); // guest/undeployed → paper
  const intent: SuiIntent = {
    kind: "swap",
    packageId: poolDep.packageId,
    poolId: poolDep.poolId,
    fn: "swap_sui_to_susd",
    coinType: SUI_COIN.type,
    symbol: SUI_COIN.symbol,
    decimals: SUI_COIN.decimals,
    amount: amountSui,
  };
  void propose({
    kind,
    summary: `Swap ${amountSui} SUI → SUSD via the Suica pool (gas sponsored)`,
    agent: app.ens,
    to: "suica_pool",
    amount: amountSui,
    token: "SUI",
    network: "Sui Testnet",
    calls: [`pool::swap_sui_to_susd(${amountSui} SUI)`],
    risk: 0.5,
    notes: [],
    sui: intent,
  });
}

export function runAction(a: Action, app?: AppManifest) {
  if (app?.fn === "split" && a.id === "join") return void joinTab(app);
  if (app?.fn === "split" && a.id === "settle") return void settleTab(app, a.tx);
  if (app?.fn === "pay" && a.id === "send") return void sendPayment(app, a.tx);
  if (app?.fn === "portfolio" && a.id === "rebal") return void runSwap(app, a.tx, 0.02, "Rebalance");
  if (app?.fn === "dca" && a.id === "start") return void runSwap(app, a.tx, 0.01, "DCA buy");
  // `payroll` FnKey is landed by Orion; cast avoids a red-build window during that handshake.
  if (app && (app.fn as string) === "payroll" && a.id === "payroll") return void runPayroll(app);
  if (a.tx) void propose(a.tx);
  else balloon(a.label, "Coming soon in this agent.");
}

/**
 * Instant-then-live bundle. Renders the deterministic mock bundle immediately (no waiting), then
 * swaps in real data when it arrives: the signed-in user's OWN Sui balances (portfolio), else real
 * read-only holdings for a mainnet ENS/0x target via portfolio-by-ENS (`liveBundleFor`, owned by the
 * assistant/portfolio session). Runs in the Start-menu PREVIEW too (liveBundleFor is client-cached +
 * server-rate-limited) so previews of real targets show real numbers, not mock. The own-wallet Sui
 * fetch stays window-only (canLiveSui requires !preview). Shells stay generic (same shapes).
 */
function useLiveBundle(app: AppManifest, preview?: boolean): Bundle {
  const base = useMemo(() => buildBundle(app), [app]);
  const suiAddress = useOS((s) => s.suiAddress);
  const canLiveSui = !preview && app.fn === "portfolio" && app.target === app.owner && !!suiAddress;
  // Identity of the data we WANT, so a stale async result is never rendered. Keyed on target + shell
  // (the Doom shell renders a "losses" variant of the same holdings). In preview canLiveSui is false,
  // so this is the ens key and the liveBundleFor branch runs.
  const key = canLiveSui ? `sui:${suiAddress}:${app.shell}` : `ens:${app.target}:${app.shell}`;
  const [live, setLive] = useState<{ key: string; bundle: Bundle } | null>(null);

  useEffect(() => {
    let ok = true;
    const load =
      canLiveSui && suiAddress
        ? fetchSuiBalances(suiAddress).then((b) => enhancePortfolioBundle(base, b, app.target))
        : liveBundleFor(app, base); // null unless target is a real mainnet wallet — safe to always call
    load
      .then((b) => ok && setLive(b ? { key, bundle: b } : null))
      .catch(() => ok && setLive(null)); // read failed → keep the instant mock
    return () => {
      ok = false;
    };
  }, [canLiveSui, suiAddress, base, app, app.target, app.shell, key]);

  return key && live?.key === key ? live.bundle : base;
}

export function ShellView({ app, preview }: { app: AppManifest; preview?: boolean }) {
  const bundle = useLiveBundle(app, preview);
  // A chain manifest can name a shell this build doesn't have (renamed/newer) — fall back to Explorer.
  const Shell = SHELLS[app.shell] ?? ExplorerShell;
  // "tetris but …": once TETRIS.EXE is installed (LLM-generated, sandboxed), it renders instead;
  // the built-in shell stays the fallback.
  const generated = useGeneratedFor(app);
  const run = preview ? () => {} : (a: Action) => runAction(a, app);
  const builtIn = <Shell app={app} bundle={bundle} preview={preview} run={run} />;
  return (
    <>
      <SceneStrip kind={app.scene} height={preview ? 40 : 52} label={bundle.subtitle} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", marginTop: 3, minHeight: 0 }}>
        {generated ? <GeneratedShell key={generated.label} app={app} bundle={bundle} preview={preview} run={run} shell={generated} fallback={builtIn} /> : builtIn}
      </div>
    </>
  );
}

function installedItem(app: AppManifest) {
  return getOS().items.find((i) => i.kind === "app" && i.app.id === app.id);
}

/** A running app window: menu bar + scene + shell. */
export function AppWindow({ app, winId }: { app: AppManifest; winId: string }) {
  const bundle = useMemo(() => buildBundle(app), [app]);
  const compatible = (Object.keys(SHELL_META) as ConcreteShell[]).filter((s) => SHELL_META[s].accepts.some((k) => bundle[k] !== undefined));
  const item = installedItem(app);
  const isPublic = app.id.startsWith("ens:") || getOS().index.some((p) => p.ens === app.ens);
  const program = useGenShells((s) => {
    const hit = detectProgram(app.prompt);
    return hit ? (s.shells[hit.label] ?? null) : null;
  });
  const usingGenerated = !!useGeneratedFor(app);

  const reshape = (shell: ConcreteShell) => {
    const next = { ...app, shell, icon: shell === "explorer" ? app.icon : SHELL_META[shell].icon };
    if (item) updateApp(item.id, next);
    closeWindow(winId);
    openApp(next);
  };

  const file: MenuEntry[] = [
    { label: "Save As…", icon: "folder", kbd: "Ctrl+S", onClick: () => openWindow({ title: "Save As", icon: "folder", payload: { type: "saveas", app }, w: 440, h: 260, dialog: true }) },
    ...(!item && isPublic ? [{ label: "Pin to Desktop", icon: "computer" as const, onClick: () => (installApp(app, null, { pin: true }), balloon("Pinned", app.ens)) }] : []),
    {
      label: app.published ? "Unpublish" : "Publish to Network",
      icon: "network",
      disabled: !item,
      onClick: () => item && void setPublished(item.id, !app.published),
    },
    {
      label: "Copy Share Link",
      icon: "globe",
      onClick: () => {
        const link = `${location.origin}/?open=${encodeURIComponent(app.ens)}`;
        void navigator.clipboard?.writeText(link).catch(() => {});
        balloon("Link copied", link);
      },
    },
    "sep",
    { label: "Close", onClick: () => closeWindow(winId) },
  ];
  const builtInView: MenuEntry[] = compatible.map((s) => ({ label: `${s === app.shell && !usingGenerated ? "● " : ""}${SHELL_META[s].label}`, icon: SHELL_META[s].icon, onClick: () => (program && setPrefer(app.id, false), reshape(s)) }));
  const view: MenuEntry[] = program ? [{ label: `${usingGenerated ? "● " : ""}${program.exe} (generated)`, icon: "document", onClick: () => setPrefer(app.id, true) }, "sep", ...builtInView] : builtInView;
  const help: MenuEntry[] = [
    {
      label: "About this agent…",
      icon: "info",
      onClick: () => message(`About ${app.ens}`, "agent", `${app.title}\n${app.description}`, JSON.stringify({ ens: app.ens, shell: app.shell, fn: app.fn, vibe: app.vibe, scene: app.scene, target: app.target, params: app.params }, null, 1)),
    },
  ];
  return (
    <>
      <MenuBar menus={[{ label: "File", items: file }, { label: "View", items: view }, { label: "Help", items: help }]} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", padding: 3, minHeight: 0 }}>
        <ShellView app={app} />
      </div>
      <div className="statusbar">
        <div>{app.readOnly ? `Viewing ${app.target} (read-only)` : `Agent ${app.ens}`}</div>
        <div>{(SHELL_META[app.shell] ?? SHELL_META.explorer).label} × {app.fn}</div>
        <div>{app.published ? "🌐 Published" : "🔒 Private"}</div>
      </div>
    </>
  );
}
