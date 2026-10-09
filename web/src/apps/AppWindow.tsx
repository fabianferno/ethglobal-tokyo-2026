"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { MenuBar, type MenuEntry } from "@/components/win99/Menu";
import { RenderTree } from "@/kit/Render";
import { fetchData } from "@/lib/compose/client";
import { applyOp, emptyUi, type Op } from "@/lib/kit/ops";
import { treeText } from "@/lib/kit/tree";
import type { AppState } from "@/lib/kit/types";
import { type AppSpec, closeWindow, message, setStats } from "@/os/store";
import { useComposed } from "./useComposed";

/** A composed app: state → Jev composes the tree → interactions change state → Jev re-composes. */
export function AppWindow({ app, winId }: { app: AppSpec; winId: string }) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<AppState>({ prompt: app.prompt, data: null, ui: emptyUi(), history: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchData(app.prompt, nonce)
      .then((data) => live && setState({ prompt: app.prompt, data, ui: emptyUi(), history: [] }))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [app.prompt, nonce]);

  // Compose only once data exists (the Start preview already gave us a layout to show meanwhile).
  const c = useComposed(state, app.tree, { enabled: !!state.data, delayMs: 0 });
  useEffect(() => setStats(winId, { calls: c.calls, ms: c.ms, offline: c.offline }), [winId, c.calls, c.ms, c.offline]);
  const dispatch = useMemo(() => (op: Op) => setState((s) => applyOp(s, op)), []);

  // Ask Gemini again: clears the error in the same click (never from inside the effect).
  const retry = () => (setError(null), setNonce((n) => n + 1));
  const file: MenuEntry[] = [
    { label: "New data", icon: "document", onClick: retry },
    "sep",
    { label: "Close", onClick: () => closeWindow(winId) },
  ];
  const help: MenuEntry[] = [{ label: "How was this made?", icon: "info", onClick: () => message(app.title, "info", `Jev composed this window in ${c.calls} Decisions calls (${c.ms} ms)${c.offline ? " — offline fallback" : ""}. Gemini wrote the data.`, c.tree ? treeText(c.tree) : "") }];

  return (
    <>
      <MenuBar menus={[{ label: "File", items: file }, { label: "Help", items: help }]} />
      <div className="grow" style={{ display: "flex", flexDirection: "column", padding: 3, minHeight: 0 }}>
        {error ? (
          <div className="sunken" style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, background: "#fff" }}>
            <Icon name="error" size={32} />
            <b className="grow">{error}</b>
            <button className="btn" onClick={retry}>Try again</button>
          </div>
        ) : c.tree ? (
          <RenderTree tree={c.tree} state={state} dispatch={dispatch} preview={false} />
        ) : (
          <div className="kit-open sunken">Jev is designing this app…</div>
        )}
      </div>
      <div className="statusbar">
        <div>{c.composing ? "Jev is composing…" : c.offline ? "Composed offline" : `Composed by Jev · ${c.calls} calls · ${c.ms} ms`}</div>
        <div>{state.data ? `${state.data.collections.map((x) => `${x.records.length} ${x.name}`).join(" · ")}` : "Gemini is writing the data…"}</div>
        <div>{state.history.at(-1) ?? "Ready"}</div>
      </div>
    </>
  );
}
