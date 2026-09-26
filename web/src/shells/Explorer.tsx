"use client";

import { Icon } from "@/components/win99/Icon";
import { GroupBox, LineChart, ListView, Progress } from "@/components/win99/Widgets";
import type { ShellProps } from "./AppFrame";

/** The universal shell: Win98 "web view" folder layout. Renders whatever shapes the function produced. */
export function ExplorerShell({ app, bundle, preview, run }: ShellProps) {
  return (
    <div className="row grow" style={{ alignItems: "stretch", gap: 6, minHeight: 0 }}>
      <aside className="sunken scroll" style={{ width: preview ? 170 : 220, flex: "none", padding: 10, background: "linear-gradient(#f4f6fb, #dfe6f7)" }}>
        <div className="row" style={{ gap: 10 }}>
          <Icon name={app.icon} size={40} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{bundle.title}</div>
            <div className="muted" style={{ fontSize: 11 }}>{app.ens}</div>
          </div>
        </div>
        <hr style={{ border: 0, borderTop: "2px solid var(--select)", margin: "10px 0" }} />
        {bundle.gauge && (
          <div className="col" style={{ gap: 4, marginBottom: 10 }}>
            <b>{bundle.gauge.label}</b>
            <Progress value={bundle.gauge.value} width={preview ? 148 : 196} />
            <span className="muted" style={{ fontSize: 11 }}>{bundle.gauge.caption}</span>
          </div>
        )}
        {bundle.settings && (
          <div className="col" style={{ gap: 3, marginBottom: 10 }}>
            {bundle.settings.map((s) => (
              <div key={s.label} className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                <span className="muted">{s.label}</span>
                <b>{s.value}</b>
              </div>
            ))}
          </div>
        )}
        <div className="col" style={{ gap: 6 }}>
          {bundle.actions.map((a) => (
            <button key={a.id} className={`btn ${a.primary ? "primary" : ""}`} onClick={() => run(a)} disabled={preview}>
              {a.label}
            </button>
          ))}
        </div>
      </aside>
      <section className="col grow" style={{ gap: 6, minHeight: 0 }}>
        {bundle.series && (
          <GroupBox label={bundle.series.label} style={{ margin: 0, padding: "8px 8px 4px", flex: "none" }}>
            <div className="sunken" style={{ padding: 2 }}>
              <LineChart points={bundle.series.points} height={preview ? 70 : 110} />
            </div>
          </GroupBox>
        )}
        {bundle.table && <ListView table={bundle.table} />}
        {bundle.list && (
          <div className="sunken scroll grow" style={{ padding: 4, minHeight: 80 }}>
            {bundle.list.items.map((it, i) => (
              <div key={i} className="row" style={{ padding: "5px 6px", borderBottom: "1px dotted #cfccc7" }}>
                {it.icon && <Icon name={it.icon} size={24} />}
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{it.title}</div>
                  {it.subtitle && <div className="muted" style={{ fontSize: 11 }}>{it.subtitle}</div>}
                </div>
                {it.right && <b className={it.tone === "up" ? "up" : it.tone === "down" ? "down" : ""}>{it.right}</b>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
