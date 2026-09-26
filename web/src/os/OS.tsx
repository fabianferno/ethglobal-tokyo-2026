"use client";

import { useEffect, useMemo, useState } from "react";
import { Assistant } from "@/assistant/Assistant";
import { InstallTray } from "@/assistant/InstallTray";
import { Icon } from "@/components/win99/Icon";
import { Window } from "@/components/win99/Window";
import { completeGoogleLoginFromHash, hasGoogleLogin, startGoogleLogin } from "@/lib/sui/session";
import { AppWindow } from "@/shells/AppFrame";
import { MessageBox, NewFolderDialog, SaveAsDialog, SignDialog } from "@/system/Dialogs";
import { FolderView, MyComputer, NetworkNeighborhood, RecycleBin, TaskManager, UIKit } from "@/system/SystemApps";
import { Desktop } from "./Desktop";
import { StartMenu } from "./StartMenu";
import { canonicalName, claimUsername, clearBsod, getOS, hydrate, login, openApp, openFolder, pinFolder, refreshIndex, toggleStart, useOS, type Win } from "./store";
import { Taskbar } from "./Taskbar";
import { Welcome } from "./Welcome";

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
  const [authErr, setAuthErr] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, []);

  // Returning from Google's zkLogin redirect: finish the proof and log on as that Sui wallet.
  useEffect(() => {
    void (async () => {
      try {
        const session = await completeGoogleLoginFromHash();
        if (session) login("me", { suiAddress: session.address });
      } catch (e) {
        setAuthErr((e as Error).message);
      }
    })();
  }, []);

  // Published apps + folders come from ENS; refresh on log-on and every minute.
  useEffect(() => {
    if (!user) return;
    void refreshIndex();
    const id = setInterval(() => void refreshIndex(), 60_000);
    return () => clearInterval(id);
  }, [user]);

  // Every user gets <name>.users.suica.eth → their device key, claimed in the background.
  useEffect(() => {
    if (user) claimUsername();
  }, [user]);

  // Share links: /?open=<ens> rebuilds the app (or a shared folder) from its ENS records after log-on.
  // A moved app's old name is an ENS alias of its new one, so old links still land on it.
  useEffect(() => {
    if (!user) return;
    const requested = new URLSearchParams(location.search).get("open");
    if (!requested) return;
    history.replaceState(null, "", location.pathname);
    void (async () => {
      const find = (ens: string) => [...getOS().items.flatMap((i) => (i.kind === "app" ? [i.app] : [])), ...getOS().index].find((a) => a.ens === ens);
      if (!find(requested)) await refreshIndex();
      const ens = canonicalName(requested);
      const app = find(ens);
      if (app) return void openApp(app);
      if (getOS().indexFolders.includes(ens)) openFolder(pinFolder(ens));
    })();
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
  if (!user) return <Login error={authErr} />;

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
      <InstallTray />
      <Assistant />
      <Welcome />
      {balloon && (
        <div className="balloon" role="status">
          <b>{balloon.title}</b>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 3 }}>{balloon.text}</div>
        </div>
      )}
      {bsod && (
        <div className="bsod" onClick={clearBsod} onKeyDown={clearBsod} tabIndex={0} autoFocus>
          <div className="inner">
            <p style={{ textAlign: "center" }}><span className="tag">Suica OS</span></p>
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

function Login({ error }: { error?: string | null }) {
  const [name, setName] = useState("guest");
  const [googleErr, setGoogleErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const googleReady = hasGoogleLogin();
  const err = googleErr ?? error;

  const google = () => {
    setGoogleErr(null);
    setConnecting(true);
    // Navigates away on success; only returns here if starting the flow failed.
    startGoogleLogin().catch((e: Error) => {
      setGoogleErr(e.message);
      setConnecting(false);
    });
  };

  return (
    <div className="desktop" style={{ inset: 0, display: "grid", placeItems: "center" }}>
      <div className="window active" style={{ position: "relative", width: 460, minHeight: 0 }}>
        <div className="titlebar">
          <Icon name="logo" size={18} />
          <span className="title">Welcome to Suica OS</span>
        </div>
        <div className="col" style={{ padding: 14, gap: 12 }}>
          <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
            <Icon name="logo" size={56} />
            <div className="col" style={{ gap: 4 }}>
              <b style={{ fontSize: 16 }}>Log on</b>
              <span className="muted">Every app you create becomes an agent with its own ENS name under suica.eth and its own Sui wallet.</span>
            </div>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <button type="button" className="btn primary" onClick={google} disabled={!googleReady || connecting}>
              {connecting ? "Redirecting to Google…" : "Log on with Google (zkLogin)"}
            </button>
            <span className="muted" style={{ fontSize: 11 }}>
              {googleReady ? "Real Sui wallet, no seed phrase. Gas is sponsored — you never hold SUI." : "Google client id not configured — guest mode only."}
            </span>
          </div>
          {err && <span className="down" style={{ fontSize: 12 }}>⚠ {err}</span>}
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <div className="grow" style={{ height: 1, background: "var(--shadow, #808080)" }} />
            <span className="muted" style={{ fontSize: 11 }}>or continue as guest (paper mode)</span>
            <div className="grow" style={{ height: 1, background: "var(--shadow, #808080)" }} />
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
              <span style={{ width: 90 }}>Guest name:</span>
              <input className="field grow" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
              <button type="submit" className="btn">Continue as guest</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
