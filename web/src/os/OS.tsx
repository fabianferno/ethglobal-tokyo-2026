"use client";

import { useEffect, useMemo } from "react";
import { Assistant } from "@/assistant/Assistant";
import { Window } from "@/components/win99/Window";
import { AppWindow } from "@/apps/AppWindow";
import { MessageBox } from "@/system/Dialogs";
import { AboutJevOS, TaskManager, UIKit } from "@/system/SystemApps";
import { Desktop } from "./Desktop";
import { StartMenu } from "./StartMenu";
import { boot, toggleStart, useOS, type Win } from "./store";
import { Taskbar } from "./Taskbar";
import { Welcome } from "./Welcome";

function WindowContent({ win }: { win: Win }) {
  const p = win.payload;
  switch (p.type) {
    case "app":
      return <AppWindow app={p.app} winId={win.id} />;
    case "msg":
      return <MessageBox icon={p.icon} text={p.text} detail={p.detail} winId={win.id} />;
    case "system":
      return { mycomputer: <AboutJevOS />, taskmgr: <TaskManager />, kit: <UIKit /> }[p.key];
  }
}

export function OS() {
  const ready = useOS((s) => s.booted);
  const windows = useOS((s) => s.windows);
  const startOpen = useOS((s) => s.startOpen);
  const balloon = useOS((s) => s.balloon);
  const topId = useMemo(() => windows.reduce((a, w) => (!w.min && w.z > (a?.z ?? -1) ? w : a), undefined as Win | undefined)?.id, [windows]);

  useEffect(() => {
    boot();
  }, []);

  // Win key / Ctrl+Esc opens Start, like the real thing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "Escape") || e.key === "Meta") toggleStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return <div className="desktop" />;

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
      <Assistant />
      <Welcome />
      {balloon && (
        <div className="balloon" role="status">
          <b>{balloon.title}</b>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 3 }}>{balloon.text}</div>
        </div>
      )}
    </>
  );
}
