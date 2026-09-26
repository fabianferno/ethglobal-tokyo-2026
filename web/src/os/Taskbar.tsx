"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { focus, openSystem, patchWindow, toggleStart, useOS } from "./store";

export function Taskbar() {
  const windows = useOS((s) => s.windows);
  const startOpen = useOS((s) => s.startOpen);
  const activity = useOS((s) => s.activity);
  const top = windows.reduce((a, w) => (!w.min && w.z > (a?.z ?? -1) ? w : a), undefined as (typeof windows)[number] | undefined);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15000);
    return () => (clearTimeout(first), clearInterval(id));
  }, []);

  return (
    <div className="taskbar">
      <button className={`btn start-btn ${startOpen ? "pressed" : ""}`} onClick={() => toggleStart()}>
        <Icon name="logo" size={24} />
        Start
      </button>
      <div className="tool-sep" style={{ height: 28 }} />
      <div className="task-btns">
        {windows.map((w) => (
          <button
            key={w.id}
            className={`btn task-btn ${top?.id === w.id ? "active" : ""}`}
            onClick={() => (top?.id === w.id ? patchWindow(w.id, { min: true }) : focus(w.id))}
            title={w.title}
          >
            <Icon name={w.icon} size={18} />
            <span>{w.title}</span>
          </button>
        ))}
      </div>
      <div className="tray">
        <button title="Task Manager" onClick={() => openSystem("taskmgr")} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", position: "relative" }}>
          <Icon name="agent" size={20} />
          {activity.length > 0 && <span className="badge bad" style={{ position: "absolute", top: -6, right: -8, fontSize: 9, padding: "0 3px" }}>{activity.length}</span>}
        </button>
        <Icon name="network" size={20} />
        <span style={{ minWidth: 64, textAlign: "right" }} suppressHydrationWarning>
          {now?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
