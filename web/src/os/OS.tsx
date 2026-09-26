"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { Window } from "@/components/win99/Window";
import { PUBLISHED } from "@/lib/compose/registry";
import { AppWindow } from "@/shells/AppFrame";
import { MessageBox, NewFolderDialog, SaveAsDialog, SignDialog } from "@/system/Dialogs";
import { FolderView, MyComputer, NetworkNeighborhood, RecycleBin, TaskManager, UIKit } from "@/system/SystemApps";
import { Desktop } from "./Desktop";
import { StartMenu } from "./StartMenu";
import { clearBsod, getOS, hydrate, login, openApp, toggleStart, useOS, type Win } from "./store";
import { Taskbar } from "./Taskbar";

function WindowContent({ win }: { win: Win }) {
  const p = win.payload;
  switch (p.type) {
    case "app":
      return <AppWindow app={p.app} winId={win.id} />;
    case "folder":
      return <FolderView folderId={p.folderId} />;
    case "sign":
      return <SignDialog tx={p.tx} reqId={p.reqId} winId={win.id} />;
    case "msg":
      return <MessageBox icon={p.icon} text={p.text} detail={p.detail} winId={win.id} />;
    case "saveas":
      return <SaveAsDialog app={p.app} winId={win.id} />;
    case "newfolder":
      return <NewFolderDialog winId={win.id} />;
    case "system":
      return { mycomputer: <MyComputer />, taskmgr: <TaskManager />, network: <NetworkNeighborhood />, recycle: <RecycleBin />, kit: <UIKit /> }[p.key];
  }
}

export function OS() {
  const ready = useOS((s) => s.hydrated);
  const user = useOS((s) => s.user);
  const windows = useOS((s) => s.windows);
  const startOpen = useOS((s) => s.startOpen);
  const bsod = useOS((s) => s.bsod);
  const balloon = useOS((s) => s.balloon);
  const topId = useMemo(() => windows.reduce((a, w) => (!w.min && w.z > (a?.z ?? -1) ? w : a), undefined as Win | undefined)?.id, [windows]);

  useEffect(() => {
    hydrate();
  }, []);

  // Share links: /?open=<ens> opens a published agent after log-on.
  useEffect(() => {
    if (!user) return;
    const ens = new URLSearchParams(location.search).get("open");
    if (!ens) return;
    const app = [...getOS().items.flatMap((i) => (i.kind === "app" ? [i.app] : [])), ...PUBLISHED].find((a) => a.ens === ens);
    if (app) openApp(app);
    history.replaceState(null, "", location.pathname);
  }, [user]);

  // Win key / Ctrl+Esc opens Start, like the real thing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "Escape") || e.key === "Meta") toggleStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return <div className="desktop" />;
  if (!user) return <Login />;

  return (
    <>
      <Desktop />
      {windows.map((w) => (
        <Window key={w.id} win={w} active={w.id === topId}>
          <WindowContent win={w} />
        </Window>
      ))}
      {startOpen && <StartMenu />}
      <Taskbar />
      {balloon && (
        <div className="balloon" role="status">
          <b>{balloon.title}</b>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 3 }}>{balloon.text}</div>
        </div>
      )}
      {bsod && (
        <div className="bsod" onClick={clearBsod} onKeyDown={clearBsod} tabIndex={0} autoFocus>
          <div className="inner">
            <p style={{ textAlign: "center" }}><span className="tag">AgentOS 99</span></p>
            <p>A fatal exception {bsod.code} has occurred in agent {bsod.agent}. The transaction was rejected by the AgentVault Move module and no funds moved.</p>
            {bsod.detail && <p>* {bsod.detail}</p>}
            <p>* The agent&apos;s AgentCap has been frozen pending owner review.<br />* Press any key to return to the desktop.</p>
            <p style={{ textAlign: "center" }}>Press any key to continue _</p>
          </div>
        </div>
      )}
    </>
  );
}

function Login() {
  const [name, setName] = useState("disha.eth");
  return (
    <div className="desktop" style={{ inset: 0, display: "grid", placeItems: "center" }}>
      <div className="window active" style={{ position: "relative", width: 460, minHeight: 0 }}>
        <div className="titlebar">
          <Icon name="logo" size={18} />
          <span className="title">Welcome to AgentOS 99</span>
        </div>
        <div className="col" style={{ padding: 14, gap: 12 }}>
          <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
            <Icon name="logo" size={56} />
            <div className="col" style={{ gap: 4 }}>
              <b style={{ fontSize: 16 }}>Log on with your ENS name</b>
              <span className="muted">Every app you create becomes an agent under this name, with its own Sui wallet.</span>
            </div>
          </div>
          <form
            className="col"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              login(name);
            }}
          >
            <label className="row">
              <span style={{ width: 90 }}>User name:</span>
              <input className="field grow" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="row">
              <span style={{ width: 90 }}>Password:</span>
              <input className="field grow" disabled placeholder="zkLogin — coming soon" />
            </label>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" className="btn" disabled>Sign in with Google</button>
              <button type="submit" className="btn primary">OK</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
