"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/win99/Icon";
import { type AppManifest, draftManifest, MAX_PROMPT, SHELL_META, topCombos } from "@/lib/compose/compose";
import { paramChips, parse } from "@/lib/intent/parse";
import { topK } from "@/lib/intent/types";
import { ShellView } from "@/shells/AppFrame";
import { message, openApp, openSystem, SYSTEM_APPS, type SystemKey, toggleStart } from "./store";
import { type ActionKey, actionHits, showNotFound, systemHits } from "./searchRank";
import { useIntent } from "./useIntent";
import { TRY as WELCOME_TRY } from "./Welcome";
import { openWelcome, takeStartQuery } from "./welcomeStore";

type Entry =
  | { kind: "create"; app: AppManifest; p: number }
  | { kind: "system"; key: SystemKey; label: string; icon: IconName }
  | { kind: "action"; key: ActionKey; label: string; icon: IconName }
  | { kind: "notfound"; text: string };

const TRY = WELCOME_TRY.map((t) => t.q);

const PINNED: { key: SystemKey; label: string; icon: IconName }[] = [
  { key: "mycomputer", label: "About Jev OS", icon: "computer" },
  { key: "taskmgr", label: "Task Manager", icon: "task" },
  { key: "kit", label: "Windows 98 UI Kit", icon: "logo" },
];

export function StartMenu() {
  // The Welcome dialog's "Try it" buttons open Start with a prompt already typed.
  const [q, setQ] = useState(takeStartQuery);
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

  const { result, busy } = useIntent(q);
  const params = useMemo(() => parse(q), [q]);

  const entries: Entry[] = useMemo(() => {
    // Like Windows 98's Start → Help: the Welcome dialog is always one click away.
    if (!q.trim()) return [...PINNED.map((p): Entry => ({ kind: "system", ...p })), { kind: "action", key: "welcome", label: "Help & Welcome", icon: "help" }];
    if (!result) return [];
    const systems: Entry[] = [
      ...actionHits(q).map((a): Entry => ({ kind: "action", key: a.key, label: a.label, icon: "help" })),
      ...systemHits(q).map((s): Entry => ({ kind: "system", key: s.key, label: s.label, icon: SYSTEM_APPS[s.key].icon })),
    ];
    const create = topCombos(result, 3, q).map((combo): Entry => ({ kind: "create", app: draftManifest({ prompt: q, intent: result, params, combo }), p: combo.p }));
    const out: Entry[] = [...systems, ...create];
    if (showNotFound({ q, result, hasOther: out.length > 0, systems: systems.length })) out.push({ kind: "notfound", text: q });
    return out;
  }, [q, result, params]);

  const sel = entries[Math.min(hot, entries.length - 1)];

  const activate = (e: Entry | undefined) => {
    if (!e) return;
    toggleStart(false);
    if (e.kind === "system") openSystem(e.key);
    else if (e.kind === "action") openWelcome();
    else if (e.kind === "create") openApp(e.app);
    else message("Error", "error", `Windows cannot find '${e.text.split(/\s+/)[0].toLowerCase()}.exe'.`, "Try: minesweeper but about cats");
  };

  return (
    <div ref={root} className="start-menu raised" role="menu" onKeyDown={(e) => e.key === "Escape" && toggleStart(false)}>
      <div className="start-banner">
        Jev<b>OS</b>
      </div>
      <div className="col" style={{ width: 330, flex: "none", gap: 0, padding: "4px 4px 4px 6px" }}>
        <div className="row" style={{ padding: "6px 4px 8px", gap: 10, borderBottom: "1px solid var(--shadow)", boxShadow: "0 1px 0 var(--hilite)" }}>
          <Icon name="logo" size={36} />
          <div className="grow" style={{ minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>Type anything</b>
            <div className="muted" style={{ fontSize: 11 }}>Jev builds the app while you type.</div>
          </div>
        </div>

        <div className="grow scroll" style={{ padding: "4px 0" }}>
          {!q.trim() && <SectionLabel>Programs</SectionLabel>}
          {entries.map((e, i) => {
            const prev = entries[i - 1];
            const header = e.kind === "create" && prev?.kind !== "create" ? "Create new" : null;
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
                {TRY.map((t) => (
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
              maxLength={MAX_PROMPT}
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
    e.kind === "system" || e.kind === "action"
      ? [e.icon, e.label, "", ""]
      : e.kind === "notfound"
        ? (["error", `${e.text.split(/\s+/)[0]}.exe`, "Not found", ""] as const)
        : [e.app.icon, e.app.title, `✨ ${SHELL_META[e.app.shell].label} × ${e.app.shape}`, `${Math.round(e.p * 100)}%`];
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
  if (!entry || entry.kind === "system" || entry.kind === "action" || entry.kind === "notfound") {
    return (
      <div className="sunken grow col" style={{ alignItems: "center", justifyContent: "center", background: "linear-gradient(#f4f6fb, #dfe6f7)", gap: 10, padding: 20, textAlign: "center" }}>
        <Icon name={entry?.kind === "notfound" ? "error" : "logo"} size={64} />
        <b style={{ fontSize: 16 }}>{entry?.kind === "notfound" ? "Windows cannot find that program." : "Type anything."}</b>
        <span className="muted">Nothing here is installed.<br />Jev composes each app as you type.</span>
      </div>
    );
  }
  const app = entry.app;
  return (
    <div className="window active" style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}>
      <div className="titlebar">
        <Icon name={app.icon} size={18} />
        <span className="title">{app.title}</span>
        <span className="badge info" style={{ textShadow: "none" }}>PREVIEW</span>
      </div>
      <div className="window-body" style={{ padding: 3, zoom: 0.82, overflow: "hidden" }}>
        <ShellView key={`${app.shell}:${app.shape}:${app.prompt}`} app={app} preview />
      </div>
      <div className="statusbar">
        <div>{app.jevSource === "jev" ? `Jev · ${app.jevMs} ms` : "offline"}</div>
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
        {bars("shape", topK(result.shape, 3))}
      </div>
      <div className="row mono" style={{ fontSize: 11, marginTop: 4, gap: 8 }}>
        {result.source === "jev" ? <span className="badge ok">Jev</span> : <span className="badge warn">offline</span>}
        <span>{busy ? "…" : `${result.cached ? "cached" : `${result.latencyMs}ms`}`}</span>
        <span>vibe:{result.vibe.value}</span>
        <span>scene:{result.scene.value}</span>
        {result.source !== "jev" && <span>keyword fallback</span>}
      </div>
    </div>
  );
}
