"use client";

import { useState } from "react";
import { fmt, LineChart } from "@/components/win99/Widgets";
import type { ShellProps } from "./AppFrame";

const COLS = "ABCDEFGHIJ".split("");

/** Formula shown in the formula bar for a number cell — sells the "it's really a spreadsheet" joke. */
function formulaFor(row: number, col: number, v: unknown) {
  return typeof v === "number" ? `=JEV(A${row + 1}, "${COLS[col]}")` : null;
}

export function ExcelShell({ app, bundle, preview, run }: ShellProps) {
  const table = bundle.table!;
  const rows = table.rows;
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 1, c: 3 });
  const [tab, setTab] = useState(0);

  const selKey = table.columns[sel.c]?.key;
  const selRow = sel.r === 0 ? null : rows[sel.r - 1];
  const selVal = sel.r === 0 ? table.columns[sel.c]?.label : selRow ? fmt(selRow[selKey!], table.columns[sel.c]?.fmt, table.columns[sel.c]?.unit) : "";
  const formula = (selKey && selRow && formulaFor(sel.r, sel.c, selRow[selKey])) || selVal;

  return (
    <div className="col grow" style={{ gap: 3, minHeight: 0 }}>
      <div className="row" style={{ gap: 4, flex: "none" }}>
        <div className="field" style={{ width: 64, height: 24, padding: "2px 6px", fontWeight: 700 }}>{`${COLS[sel.c]}${sel.r + 1}`}</div>
        <b style={{ fontStyle: "italic", fontFamily: "Georgia, serif", width: 20, textAlign: "center" }}>fx</b>
        <div className="field grow mono" style={{ height: 24, padding: "3px 6px", fontSize: 12 }}>{formula}</div>
        {!preview &&
          bundle.actions.map((a) => (
            <button key={a.id} className={`btn sm ${a.primary ? "primary" : ""}`} onClick={() => run(a)}>{a.label}</button>
          ))}
      </div>

      {tab === 0 ? (
        <div className="sunken grow scroll" style={{ background: "#fff", position: "relative", minHeight: 0 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={hdr(28)} />
                {COLS.slice(0, Math.max(table.columns.length + 1, 8)).map((L, c) => (
                  <th key={L} style={{ ...hdr(92), background: c === sel.c ? "#c7d3f3" : hdr(0).background }}>{L}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[null, ...rows, ...Array(Math.max(0, 18 - rows.length)).fill(undefined)].map((row, r) => (
                <tr key={r}>
                  <th style={{ ...hdr(28), background: r === sel.r ? "#c7d3f3" : hdr(0).background }}>{r + 1}</th>
                  {COLS.slice(0, Math.max(table.columns.length + 1, 8)).map((_, c) => {
                    const col = table.columns[c];
                    const v = r === 0 ? col?.label : row && col ? row[col.key] : undefined;
                    const text = r === 0 ? (v ?? "") : fmt(v as string | number | undefined, col?.fmt, col?.unit);
                    const neg = typeof v === "number" && v < 0 && col?.fmt === "pct";
                    const pos = typeof v === "number" && v > 0 && col?.fmt === "pct";
                    const active = sel.r === r && sel.c === c;
                    const totalRow = false;
                    return (
                      <td
                        key={c}
                        onClick={() => setSel({ r, c })}
                        style={{
                          border: "1px solid #d9d9d9",
                          padding: "2px 5px",
                          height: 21,
                          maxWidth: 120,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textAlign: typeof v === "number" ? "right" : "left",
                          fontWeight: r === 0 || totalRow ? 700 : 400,
                          background: r === 0 ? "#e6efe0" : totalRow ? "#fff7cc" : undefined,
                          borderTop: totalRow ? "2px solid #1b1b1b" : undefined,
                          color: neg ? "#c21d17" : pos ? "#127a2a" : undefined,
                          outline: active ? "2px solid #1b1b1b" : undefined,
                          outlineOffset: -2,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {bundle.series && !preview && (
            <div className="raised" style={{ position: "absolute", left: 130, top: 22 + (rows.length + 2) * 22, width: 330, padding: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>📈 {bundle.series.label}</div>
              <div className="sunken" style={{ padding: 2 }}>
                <LineChart points={bundle.series.points} width={320} height={110} color="#1f9a3a" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="sunken grow scroll mono selectable" style={{ background: "#fff", padding: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify({ prompt: app.prompt, shell: app.shell, shape: app.shape, vibe: app.vibe, params: app.params }, null, 2)}
        </div>
      )}

      <div className="row" style={{ gap: 0, flex: "none" }}>
        {["Sheet1", "Manifest"].map((t, i) => (
          <button key={t} className="tab" onClick={() => setTab(i)} style={{ borderRadius: "0 0 4px 4px", borderTop: 0, borderBottom: "1px solid #1b1b1b", fontWeight: tab === i ? 700 : 400, background: tab === i ? "#fff" : undefined, padding: "2px 12px" }}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function hdr(w: number): React.CSSProperties {
  return { width: w, minWidth: w, background: "#e3e0db", border: "1px solid #a9a6a1", fontWeight: 500, fontSize: 11, padding: "2px 4px", position: "sticky", top: 0 };
}
