"use client";

import { useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { Progress } from "@/components/win99/Widgets";
import { SHELL_META } from "@/lib/compose/compose";
import { closeWindow, focus, message, useOS } from "@/os/store";

/* ── About Jev OS (the old My Computer) ── */

export function AboutJevOS() {
  return (
    <div style={{ display: "flex", gap: 14, padding: 14 }}>
      <Icon name="logo" size={48} />
      <div className="selectable">
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          Jev<span style={{ color: "#7de3c4" }}>OS</span>
        </div>
        <p>Every window here is composed live. Jev picks the program, the shape and the tone as you type; Gemini writes what goes inside.</p>
        <p>Nothing is saved. Close a window and the app is gone; type it again and it is made again.</p>
        <p style={{ fontSize: 11, color: "#555" }}>Jev runs on the OpenAI Decisions API (gpt-6-luna) · content and pictures by Gemini.</p>
      </div>
    </div>
  );
}

/* ── Task Manager: the apps running right now, and how fast Jev composed each ── */

export function TaskManager() {
  const windows = useOS((s) => s.windows);
  const apps = windows.flatMap((w) => (w.payload.type === "app" ? [{ win: w, app: w.payload.app }] : []));
  const [sel, setSel] = useState<string | null>(null);
  const picked = apps.find((a) => a.win.id === sel) ?? null;
  return (
    <div className="col grow" style={{ padding: 8, gap: 8, minHeight: 0 }}>
      <div className="tabs">
        <button className="tab active">Applications</button>
      </div>
      <div className="listview sunken grow scroll" style={{ minHeight: 0 }}>
        <table>
          <thead>
            <tr>
              <th>App</th>
              <th>Program</th>
              <th>Shape</th>
              <th>Composed by</th>
              <th className="num">Jev time</th>
            </tr>
          </thead>
          <tbody>
            {apps.map(({ win, app }) => (
              <tr key={win.id} className={sel === win.id ? "sel" : ""} onClick={() => setSel(win.id)} onDoubleClick={() => focus(win.id)}>
                <td>{app.title}</td>
                <td>{SHELL_META[app.shell].label}</td>
                <td>{app.shape}</td>
                <td>{app.jevSource === "jev" ? "Jev" : "offline"}</td>
                <td className="num">{app.jevMs} ms</td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No apps running. Type something in Start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted">
          {apps.length} app{apps.length === 1 ? "" : "s"} running
        </span>
        <span className="row" style={{ gap: 6 }}>
          <button className="btn" disabled={!picked} onClick={() => picked && focus(picked.win.id)}>
            Switch To
          </button>
          <button className="btn" disabled={!picked} onClick={() => picked && (closeWindow(picked.win.id), setSel(null))}>
            End Task
          </button>
        </span>
      </div>
    </div>
  );
}

/* ── UI Kit showcase (the design system this OS is built from) ── */

export function UIKit() {
  const [tab, setTab] = useState(0);
  const [vol, setVol] = useState(60);
  return (
    <div className="col grow scroll" style={{ padding: 8, gap: 8 }}>
      <div className="tabs">
        {["Components", "Dialogs", "Icons"].map((t, i) => (
          <button key={t} className={`tab ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      <div className="tab-panel">
        {tab === 0 && (
          <div className="col" style={{ gap: 12 }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn">Default</button>
              <button className="btn primary">Primary</button>
              <button className="btn danger">Danger</button>
              <button className="btn success">Success</button>
              <button className="btn hover-demo">Hover</button>
              <button className="btn pressed">Pressed</button>
              <button className="btn" disabled>Disabled</button>
              <button className="btn"><Icon name="folder" size={18} />With Icon</button>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
              <label className="row">Text Input <input className="field" /></label>
              <label className="row">Dropdown <select className="field"><option>Windows 98</option></select></label>
              <label className="check"><input type="checkbox" defaultChecked /> Checkbox</label>
              <label className="radio"><input type="radio" name="r" defaultChecked /> Radio</label>
              <input type="range" className="slider" value={vol} onChange={(e) => setVol(+e.target.value)} style={{ ["--pct" as string]: `${vol}%` }} />
            </div>
            <div className="row"><span style={{ width: 70 }}>Volume</span><Progress value={vol / 100} width={300} /> {vol}%</div>
            <div className="row" style={{ gap: 4 }}>
              {["gray1", "gray2", "gray3", "navy", "purple", "teal", "cornflower", "yellow", "red", "green"].map((c) => (
                <div key={c} className="sunken" style={{ width: 28, height: 28, background: `var(--pal-${c})` }} title={c} />
              ))}
            </div>
          </div>
        )}
        {tab === 1 && (
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <button className="btn" onClick={() => message("Question", "question", "Do you want to continue?")}>Question</button>
            <button className="btn" onClick={() => message("Warning", "warning", "This action cannot be undone.")}>Warning</button>
            <button className="btn" onClick={() => message("Information", "info", "Operation completed successfully.")}>Information</button>
            <button className="btn" onClick={() => message("Error", "error", "An unexpected error has occurred.")}>Error</button>
          </div>
        )}
        {tab === 2 && <IconGrid />}
      </div>
    </div>
  );
}

function IconGrid() {
  const names = ["computer", "network", "recycle", "folder", "document", "notepad", "excel", "paint", "mine", "weather", "chart", "coin", "people", "clock", "shop", "piggy", "lock", "ticket", "globe", "search", "run", "settings", "task", "agent", "warning", "error", "info", "question", "shutdown", "rocket", "pool", "flame", "bomb", "mail", "calc", "cards", "music", "help", "drive", "logo"] as const;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
      {names.map((n) => (
        <div key={n} className="col" style={{ alignItems: "center", gap: 4 }}>
          <Icon name={n} size={36} />
          <span style={{ fontSize: 11 }}>{n}</span>
        </div>
      ))}
    </div>
  );
}
