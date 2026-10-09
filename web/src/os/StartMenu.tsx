"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/win99/Icon";
import { useComposed } from "@/apps/useComposed";
import { RenderTree } from "@/kit/Render";
import { emptyUi } from "@/lib/kit/ops";
import { treeText } from "@/lib/kit/tree";
import type { AppState, Tree } from "@/lib/kit/types";
import { message, newId, openApp, openSystem, SYSTEM_APPS, type SystemKey, toggleStart } from "./store";
import { type ActionKey, actionHits, showNotFound, systemHits } from "./searchRank";
import { TRY as WELCOME_TRY } from "./Welcome";
import { openWelcome, takeStartQuery } from "./welcomeStore";

const MAX_PROMPT = 400;

type Entry =
  | { kind: "create"; title: string }
  | { kind: "system"; key: SystemKey; label: string; icon: IconName }
  | { kind: "action"; key: ActionKey; label: string; icon: IconName }
  | { kind: "notfound"; text: string };

const TRY = WELCOME_TRY.map((t) => t.q);

const PINNED: { key: SystemKey; label: string; icon: IconName }[] = [
  { key: "mycomputer", label: "About Jev OS", icon: "computer" },
  { key: "taskmgr", label: "Task Manager", icon: "task" },
  { key: "kit", label: "Windows 98 UI Kit", icon: "logo" },
];

const titleOf = (q: string) => q.trim().replace(/^./, (x) => x.toUpperCase()).slice(0, 40);

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

  // Jev composes the preview from the prompt alone, after a short pause in typing.
  const prompt = q.trim().slice(0, MAX_PROMPT);
  const previewState = useMemo<AppState>(() => ({ prompt, data: null, ui: emptyUi(), history: [] }), [prompt]);
  const c = useComposed(previewState, null, { enabled: prompt.length >= 3, delayMs: 300 });
  const tree = prompt.length >= 3 ? c.tree : null;

  const entries: Entry[] = useMemo(() => {
    // Like Windows 98's Start → Help: the Welcome dialog is always one click away.
    if (!q.trim()) return [...PINNED.map((p): Entry => ({ kind: "system", ...p })), { kind: "action", key: "welcome", label: "Help & Welcome", icon: "help" }];
    const systems: Entry[] = [
      ...actionHits(q).map((a): Entry => ({ kind: "action", key: a.key, label: a.label, icon: "help" })),
      ...systemHits(q).map((s): Entry => ({ kind: "system", key: s.key, label: s.label, icon: SYSTEM_APPS[s.key].icon })),
    ];
    if (tree && showNotFound({ nonsense: tree.nonsense, systems: systems.length })) return [...systems, { kind: "notfound", text: q }];
    return [...systems, { kind: "create", title: titleOf(q) }];
  }, [q, tree]);

  const sel = entries[Math.min(hot, entries.length - 1)];

  const activate = (e: Entry | undefined) => {
    if (!e) return;
    toggleStart(false);
    if (e.kind === "system") openSystem(e.key);
    else if (e.kind === "action") openWelcome();
    else if (e.kind === "create") openApp({ id: newId(), title: e.title, prompt, tree: tree && !c.composing ? tree : null });
    else message("Error", "error", `Windows cannot find '${e.text.split(/\s+/)[0].toLowerCase()}.exe'.`, "Try: expense tracker for my tokyo trip");
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
        </div>
      </div>

      <div className="col grow" style={{ padding: 4, gap: 4, minWidth: 0 }}>
        <Preview entry={sel} tree={tree} state={previewState} />
        {prompt.length >= 3 && <JevHud tree={tree} composing={c.composing} calls={c.calls} ms={c.ms} offline={c.offline} />}
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
        : ["logo", e.title, "✨ composed by Jev", ""];
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

function Preview({ entry, tree, state }: { entry: Entry | undefined; tree: Tree | null; state: AppState }) {
  if (!entry || entry.kind !== "create") {
    return (
      <div className="sunken grow col" style={{ alignItems: "center", justifyContent: "center", background: "linear-gradient(#f4f6fb, #dfe6f7)", gap: 10, padding: 20, textAlign: "center" }}>
        <Icon name={entry?.kind === "notfound" ? "error" : "logo"} size={64} />
        <b style={{ fontSize: 16 }}>{entry?.kind === "notfound" ? "Windows cannot find that program." : "Type anything."}</b>
        <span className="muted">Nothing here was designed in advance.<br />Jev composes each app from parts as you type.</span>
      </div>
    );
  }
  return (
    <div className="window active" style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div className="titlebar">
        <Icon name="logo" size={18} />
        <span className="title">{entry.title}</span>
        <span className="badge info" style={{ textShadow: "none" }}>PREVIEW</span>
      </div>
      <div className="window-body" style={{ padding: 3, zoom: 0.82, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {tree ? <RenderTree tree={tree} state={state} dispatch={() => {}} preview /> : <div className="kit-open sunken">Jev is designing…</div>}
      </div>
    </div>
  );
}

function JevHud({ tree, composing, calls, ms, offline }: { tree: Tree | null; composing: boolean; calls: number; ms: number; offline: boolean }) {
  return (
    <div className="raised" style={{ padding: 6, flex: "none" }}>
      <div className="row mono" style={{ fontSize: 11, gap: 8 }}>
        {offline ? <span className="badge warn">offline</span> : <span className="badge ok">Jev</span>}
        <span>{composing ? "composing…" : `${calls} calls · ${ms} ms`}</span>
      </div>
      {tree && <div className="mono muted" style={{ fontSize: 11, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{treeText(tree)}</div>}
    </div>
  );
}
