"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/win99/Icon";
import { type AppManifest, draftManifest, SHELL_META, topCombos } from "@/lib/compose/compose";
import { FUNCTIONS } from "@/lib/compose/functions";
import { PUBLISHED, shortlist, toCandidate } from "@/lib/compose/registry";
import { paramChips, parse } from "@/lib/intent/parse";
import { topK } from "@/lib/intent/types";
import { ShellView } from "@/shells/AppFrame";
import { labelOf, ROOT, uniqueName } from "@/lib/ens/names";
import { getOS, installApp, isTaken, logout, message, openApp, openSystem, type SystemKey, toggleStart, useOS } from "./store";
import { useIntent } from "./useIntent";

type Entry =
  | { kind: "published"; app: AppManifest; p: number }
  | { kind: "create"; app: AppManifest; p: number }
  | { kind: "system"; key: SystemKey; label: string; icon: IconName }
  | { kind: "notfound"; text: string };

const TRY = [
  "microsoft excel but shows my portfolio at fabianferno.eth",
  "paint app but roast my portfolio",
  "minesweeper but it's 20x leverage SUI futures",
  "split bills with 4 friends",
  "savings circle 6 friends 50 usdc monthly",
  "weather forecast for the SUI market",
  "buy 10 USDC of SUI every day",
  "notepad diary of vitalik.eth trades",
];

const PINNED: { key: SystemKey; label: string; icon: IconName }[] = [
  { key: "mycomputer", label: "My Computer", icon: "computer" },
  { key: "taskmgr", label: "Task Manager", icon: "task" },
  { key: "network", label: "Network Neighborhood", icon: "network" },
  { key: "kit", label: "Windows 99 UI Kit", icon: "logo" },
];

export function StartMenu() {
  const user = useOS((s) => s.user)!;
  const items = useOS((s) => s.items);
  const [q, setQ] = useState("");
  const [hot, setHot] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node) || (e.target as HTMLElement).closest(".start-btn")) return;
      toggleStart(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const index = useMemo(() => {
    const mine = items.flatMap((i) => (i.kind === "app" && i.app.published ? [i.app] : []));
    return [...mine, ...PUBLISHED.filter((p) => !mine.some((m) => m.ens === p.ens))];
  }, [items]);
  const shortl = useMemo(() => shortlist(q, index), [q, index]);
  const candidates = useMemo(() => shortl.map(toCandidate), [shortl]);
  const { result, busy } = useIntent(q, candidates);
  const params = useMemo(() => parse(q), [q]);

  const entries: Entry[] = useMemo(() => {
    if (!q.trim()) return PINNED.map((p) => ({ kind: "system", ...p }));
    if (!result) return [];
    // Code-side guard on top of Jev's yes/no: an app about someone else's wallet never matches
    // a query that names a different ENS target.
    const targetClash = (app: AppManifest) => params.ensNames.length > 0 && app.readOnly && !params.ensNames.includes(app.target);
    const pub = shortl
      .map((app) => ({ kind: "published" as const, app, p: (result.matches[app.id] ?? 0) * (targetClash(app) ? 0.2 : 1) }))
      .filter((e) => e.p >= 0.35)
      .sort((a, b) => b.p - a.p)
      .slice(0, 4);
    const seen = new Set<string>();
    const create = topCombos(result, 4)
      .map((combo) => {
        const draft = draftManifest({ prompt: q, intent: result, params, owner: user, combo });
        // Show the name it will really get: first come, first served under suica.eth.
        return { kind: "create" as const, app: { ...draft, ens: uniqueName(labelOf(draft.ens), ROOT, (n) => isTaken(n)) }, p: combo.p };
      })
      .filter((e) => !seen.has(e.app.ens) && seen.add(e.app.ens))
      .slice(0, 3);
    // Best match first (only if Jev is confident), then Create new, then the rest of the published apps.
    const best = pub[0] && pub[0].p >= 0.6 ? [pub[0]] : [];
    const out: Entry[] = [...best, ...create, ...pub.slice(best.length)];
    if (result.signals.nonsense > 0.6 || out.length === 0) out.push({ kind: "notfound", text: q });
    return out;
  }, [q, result, shortl, params, user]);

  const sel = entries[Math.min(hot, entries.length - 1)];

  const activate = (e: Entry | undefined) => {
    if (!e) return;
    toggleStart(false);
    if (e.kind === "system") openSystem(e.key);
    else if (e.kind === "published") openApp(e.app);
    else if (e.kind === "create") {
      const it = installApp(e.app);
      if (it.kind === "app") openApp(it.app);
    } else {
      const guess = result && topCombos(result, 1)[0];
      message("Error", "error", `Windows cannot find '${e.text.split(/\s+/)[0].toLowerCase()}.exe'.`, guess ? `Did you mean: ${SHELL_META[guess.shell].label} · ${FUNCTIONS[guess.fn].label}?` : "Try: excel of vitalik.eth portfolio");
    }
  };

  const bestIdx = entries.findIndex((e) => e.kind === "published" && e.p >= 0.6);

  return (
    <div ref={root} className="start-menu raised" role="menu" onKeyDown={(e) => e.key === "Escape" && toggleStart(false)}>
      <div className="start-banner">
        Suica<b>OS</b>
      </div>
      <div className="col" style={{ width: 330, flex: "none", gap: 0, padding: "4px 4px 4px 6px" }}>
        <div className="row" style={{ padding: "6px 4px 8px", gap: 10, borderBottom: "1px solid var(--shadow)", boxShadow: "0 1px 0 var(--hilite)" }}>
          <Icon name="agent" size={36} />
          <div>
            <b style={{ fontSize: 15 }}>{user}</b>
            <div className="muted" style={{ fontSize: 11 }}>apps live under suica.eth · Sui Testnet</div>
          </div>
        </div>

        <div className="grow scroll" style={{ padding: "4px 0" }}>
          {!q.trim() && <SectionLabel>Programs</SectionLabel>}
          {entries.map((e, i) => {
            const prev = entries[i - 1];
            const header =
              e.kind === "published"
                ? i === bestIdx
                  ? "Best match"
                  : prev?.kind !== "published" || i - 1 === bestIdx
                    ? "Published apps"
                    : null
                : e.kind === "create" && prev?.kind !== "create"
                  ? "Create new"
                  : null;
            return (
              <div key={i}>
                {header && <SectionLabel>{header}</SectionLabel>}
                <EntryRow e={e} hot={i === hot} onHover={() => setHot(i)} onClick={() => activate(e)} />
              </div>
            );
          })}
          {!q.trim() && (
            <>
              <SectionLabel>Try typing</SectionLabel>
              <div className="col" style={{ gap: 4, padding: "0 6px" }}>
                {TRY.slice(0, 5).map((t) => (
                  <button key={t} className="chip" style={{ justifyContent: "flex-start", height: "auto", minHeight: 22, borderRadius: 3, textAlign: "left" }} onClick={() => (setQ(t), setHot(0))}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--shadow)", boxShadow: "inset 0 1px 0 var(--hilite)", paddingTop: 6 }}>
          <div className="row" style={{ gap: 6 }}>
            <Icon name="search" size={22} />
            <input
              ref={input}
              className="field grow"
              placeholder="Search or describe an app…"
              value={q}
              onChange={(e) => (setQ(e.target.value), setHot(0))}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHot((h) => Math.min(entries.length - 1, h + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHot((h) => Math.max(0, h - 1));
                } else if (e.key === "Enter") activate(sel);
              }}
              aria-label="Search"
            />
          </div>
          {q.trim() && paramChips(params).length > 0 && (
            <div className="row" style={{ flexWrap: "wrap", gap: 4, marginTop: 5 }}>
              {paramChips(params).map((c) => <span key={c} className="chip" style={{ cursor: "default" }}>{c}</span>)}
            </div>
          )}
          <div className="row" style={{ marginTop: 6, justifyContent: "space-between" }}>
            <button className="btn sm" onClick={() => (toggleStart(false), logout())}><Icon name="agent" size={16} />Log Off {getOS().user}</button>
            <button className="btn sm" onClick={() => (toggleStart(false), logout())}><Icon name="shutdown" size={16} />Shut Down</button>
          </div>
        </div>
      </div>

      <div className="col grow" style={{ padding: 4, gap: 4, minWidth: 0 }}>
        <Preview entry={sel} />
        <JevHud result={result} busy={busy} q={q} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "var(--select)", padding: "6px 6px 2px", textTransform: "uppercase", letterSpacing: 0.5 }}>{children}</div>;
}

function EntryRow({ e, hot, onHover, onClick }: { e: Entry; hot: boolean; onHover: () => void; onClick: () => void }) {
  const [icon, title, sub, right] =
    e.kind === "system"
      ? [e.icon, e.label, "", ""]
      : e.kind === "notfound"
        ? (["error", `${e.text.split(/\s+/)[0]}.exe`, "Not found", ""] as const)
        : [e.app.icon, e.app.title, e.kind === "published" ? `${e.app.ens} · ★ ${e.app.users ?? 0}` : `✨ ${e.app.ens}`, `${Math.round(e.p * 100)}%`];
  return (
    <button className={`menu-item ${hot ? "hot" : ""}`} onPointerEnter={onHover} onClick={onClick} style={{ padding: "5px 6px", alignItems: "center" }}>
      <Icon name={icon as IconName} size={28} />
      <span className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </span>
      {right && <span style={{ fontSize: 11, opacity: 0.8 }}>{right}</span>}
    </button>
  );
}

function Preview({ entry }: { entry: Entry | undefined }) {
  if (!entry || entry.kind === "system" || entry.kind === "notfound") {
    return (
      <div className="sunken grow col" style={{ alignItems: "center", justifyContent: "center", background: "linear-gradient(#f4f6fb, #dfe6f7)", gap: 10, padding: 20, textAlign: "center" }}>
        <Icon name={entry?.kind === "notfound" ? "error" : "logo"} size={64} />
        <b style={{ fontSize: 16 }}>{entry?.kind === "notfound" ? "Windows cannot find that program." : "Type anything."}</b>
        <span className="muted">Every app is an agent with an ENS name and a Sui wallet.<br />Its UI is composed by Jev as you type.</span>
      </div>
    );
  }
  const app = entry.app;
  return (
    <div className="window active" style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}>
      <div className="titlebar">
        <Icon name={app.icon} size={18} />
        <span className="title">{app.title}</span>
        <span className="badge info" style={{ textShadow: "none" }}>{entry.kind === "create" ? "PREVIEW" : "PUBLISHED"}</span>
      </div>
      <div className="window-body" style={{ padding: 3, zoom: 0.82, overflow: "hidden" }}>
        <ShellView key={`${app.ens}:${app.shell}:${app.prompt}`} app={app} preview />
      </div>
      <div className="statusbar">
        <div>{app.ens}</div>
        <div>{app.description.slice(0, 48)}</div>
      </div>
    </div>
  );
}

function JevHud({ result, busy, q }: { result: ReturnType<typeof useIntent>["result"]; busy: boolean; q: string }) {
  if (!q.trim() || !result) return null;
  const bars = (label: string, a: { value: string; p: number }[]) => (
    <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
      <b style={{ fontSize: 11 }}>{label}</b>
      {a.map((x) => (
        <div key={x.value} className="row" style={{ gap: 4, fontSize: 11 }}>
          <span style={{ width: 84, overflow: "hidden", textOverflow: "ellipsis" }}>{x.value}</span>
          <div className="sunken grow" style={{ height: 10, padding: 1 }}>
            <div style={{ width: `${Math.round(x.p * 100)}%`, height: "100%", background: "var(--progress)" }} />
          </div>
          <span style={{ width: 30, textAlign: "right" }}>{Math.round(x.p * 100)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="raised" style={{ padding: 6, flex: "none" }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        {bars("shell", topK(result.shell, 3))}
        {bars("function", topK(result.fn, 3))}
      </div>
      <div className="row mono" style={{ fontSize: 11, marginTop: 4, gap: 8 }}>
        <span className={`badge ${result.source === "jev" ? "ok" : "warn"}`}>{result.model}</span>
        <span>{busy ? "…" : `${result.cached ? "cached" : `${result.latencyMs}ms`}`}</span>
        <span>vibe:{result.vibe.value}</span>
        <span>scene:{result.scene.value}</span>
        <span>risk:{result.signals.risk.toFixed(1)}</span>
      </div>
    </div>
  );
}
