"use client";

import { useEffect, useRef, useState } from "react";
import { visibleRecords } from "@/lib/kit/ops";
import { nice, type PartProps } from "./types";

export function FormPart({ node, col, dispatch, preview }: PartProps) {
  const c = col!;
  const fields = ["field1", "field2", "field3", "field4"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  const [vals, setVals] = useState<Record<string, string>>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (preview || !Object.values(vals).some((v) => v.trim())) return;
    dispatch({ kind: "add", collection: c.name, values: vals });
    setVals({});
  };
  return (
    <form onSubmit={submit} className="col" style={{ gap: 6 }}>
      <div className="kit-title">Add to {nice(c.name)}</div>
      {fields.map((name) => {
        const f = c.fields.find((x) => x.name === name)!;
        const set = (v: string) => setVals((s) => ({ ...s, [name]: v }));
        return (
          <label key={name} className="row" style={{ gap: 6 }}>
            <span style={{ width: 80, fontSize: 12 }}>{name}</span>
            {f.type === "choice" ? (
              <select className="field grow" value={vals[name] ?? f.values![0]} onChange={(e) => set(e.target.value)}>{f.values!.map((v) => <option key={v}>{v}</option>)}</select>
            ) : f.type === "yesno" ? (
              <input type="checkbox" checked={/^(yes|true)$/.test(vals[name] ?? "")} onChange={(e) => set(e.target.checked ? "yes" : "no")} />
            ) : (
              <input className="field grow" type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={vals[name] ?? ""} onChange={(e) => set(e.target.value)} />
            )}
          </label>
        );
      })}
      <button className="btn primary" type="submit" disabled={preview}>Add</button>
    </form>
  );
}

export function SearchPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const field = node.bindings?.field ?? "";
  const [q, setQ] = useState(state.ui.filter[c.name] ?? "");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (preview) return;
    const t = setTimeout(() => dispatch({ kind: "filter", collection: c.name, query: q, field }), 500);
    return () => clearTimeout(t);
    // dispatch identity changes per render; the query is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="row" style={{ gap: 6 }}>
      <input className="field grow" placeholder={`Search ${nice(c.name)} by ${nice(field)}…`} value={q} onChange={(e) => setQ(e.target.value)} disabled={preview} />
      <span className="muted" style={{ fontSize: 11 }}>{visibleRecords(c, state.ui).length} shown</span>
    </div>
  );
}

const BTN_LABEL = (b: string) => (b === "remove-selected" ? "Remove selected" : b === "clear-selection" ? "Clear selection" : b === "clear-filter" ? "Show all" : `Sort by ${b.slice(5)}`);
export function ButtonBarPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const btns = ["btn1", "btn2", "btn3"].map((k) => node.bindings?.[k]).filter(Boolean) as string[];
  const run = (b: string) => {
    const sel = state.ui.selected[c.name];
    if (b === "remove-selected") return sel && dispatch({ kind: "remove", collection: c.name, id: sel });
    if (b === "clear-selection") return dispatch({ kind: "clear", collection: c.name, what: "selection" });
    if (b === "clear-filter") return dispatch({ kind: "clear", collection: c.name, what: "filter" });
    dispatch({ kind: "sort", collection: c.name, field: b.slice(5) });
  };
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {btns.map((b) => <button key={b} className="btn" disabled={preview || (b === "remove-selected" && !state.ui.selected[c.name])} onClick={() => run(b)}>{BTN_LABEL(b)}</button>)}
    </div>
  );
}

export function ChecklistPart({ node, col, state, dispatch, preview }: PartProps) {
  const c = col!;
  const title = node.bindings?.title ?? "", done = node.bindings?.done ?? "";
  const rows = visibleRecords(c, state.ui);
  return (
    <>
      <div className="kit-title">{nice(c.name)}</div>
      {rows.length === 0 ? <div className="kit-empty">Nothing here yet.</div> : rows.map((r) => (
        <label key={r.id} className="check" style={{ textDecoration: r[done] ? "line-through" : "none" }}>
          <input type="checkbox" checked={!!r[done]} disabled={preview} onChange={() => dispatch({ kind: "update", collection: c.name, id: r.id, field: done, value: !r[done] })} /> {String(r[title])}
        </label>
      ))}
    </>
  );
}
