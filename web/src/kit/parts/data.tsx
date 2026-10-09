"use client";

import { fmt } from "@/components/win99/Widgets";
import { aggregate, recordLabel, visibleRecords } from "@/lib/kit/ops";
import type { Collection, Rec } from "@/lib/kit/types";
import { nice, type PartProps } from "./types";

const cell = (col: Collection, rec: Rec, field: string) => {
  const f = col.fields.find((x) => x.name === field);
  const v = rec[field];
  if (f?.type === "number") return fmt(Number(v), "num");
  if (f?.type === "yesno") return v ? "✓" : "";
  return String(v ?? "");
};
const Empty = ({ col }: { col: Collection }) => <div className="kit-empty">No {col.name} yet.</div>;

export function TablePart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const cols = ["col1", "col2", "col3", "col4"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  const rows = visibleRecords(c, state.ui);
  const sel = state.ui.selected[c.name];
  return (
    <>
      <div className="kit-title">{nice(c.name)}</div>
      {rows.length === 0 ? <Empty col={c} /> : (
        <div className="listview sunken grow">
          <table>
            <thead><tr>{cols.map((f) => <th key={f} onClick={() => !preview && dispatch({ kind: "sort", collection: c.name, field: f })} style={{ cursor: "pointer" }}>{f}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={sel === r.id ? "sel" : ""} onClick={() => !preview && dispatch({ kind: "select", collection: c.name, id: r.id })}>
                  {cols.map((f) => <td key={f} className={c.fields.find((x) => x.name === f)?.type === "number" ? "num" : ""}>{cell(c, r, f)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ListPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const rows = visibleRecords(c, state.ui);
  const sel = state.ui.selected[c.name];
  const sub = node.bindings?.subtitle;
  return (
    <>
      <div className="kit-title">{nice(c.name)}</div>
      {rows.length === 0 ? <Empty col={c} /> : rows.map((r) => (
        <button key={r.id} className={`menu-item ${sel === r.id ? "hot" : ""}`} style={{ padding: "4px 6px", flexDirection: "column", alignItems: "flex-start" }} onClick={() => !preview && dispatch({ kind: "select", collection: c.name, id: r.id })}>
          <b>{cell(c, r, node.bindings?.title ?? "")}</b>
          {sub && <span style={{ fontSize: 11, opacity: 0.8 }}>{cell(c, r, sub)}</span>}
        </button>
      ))}
    </>
  );
}

export function DetailPart({ col, state }: PartProps) {
  const c = col!;
  const rec = c.records.find((r) => r.id === state.ui.selected[c.name]);
  if (!rec) return <div className="kit-empty">Select one of the {nice(c.name)} to see it here.</div>;
  return (
    <>
      <div className="kit-title">{recordLabel(c, rec)}</div>
      {c.fields.map((f) => (
        <div key={f.name} className="row" style={{ justifyContent: "space-between", fontSize: 12, borderBottom: "1px dotted #ccc", padding: "3px 0" }}>
          <span className="muted">{f.name}</span><b>{cell(c, rec, f.name)}</b>
        </div>
      ))}
    </>
  );
}

const aggLabel = (a: string, col: string) => (a === "count" ? `${col}` : `${a.split(":")[0] === "sum" ? "total" : "average"} ${a.split(":")[1]}`);
export function StatRowPart({ node, col, state }: PartProps) {
  const c = col!;
  const aggs = ["agg1", "agg2", "agg3"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  return (
    <div className="row" style={{ alignItems: "stretch" }}>
      {aggs.map((a) => (
        <div key={a} className="kit-stat raised"><span className="muted" style={{ fontSize: 11 }}>{aggLabel(a, c.name)}</span><b>{fmt(aggregate(c, state.ui, a), "num")}</b></div>
      ))}
    </div>
  );
}
