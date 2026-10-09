import type { AppState, Collection, Field, Rec, UiState, Value } from "./types";

export type Op =
  | { kind: "add"; collection: string; values: Record<string, string> }
  | { kind: "update"; collection: string; id: string; field: string; value: Value }
  | { kind: "remove"; collection: string; id: string }
  | { kind: "select"; collection: string; id: string | null }
  | { kind: "filter"; collection: string; query: string; field: string }
  | { kind: "sort"; collection: string; field: string }
  | { kind: "clear"; collection: string; what: "selection" | "filter" };

export const HISTORY_KEEP = 20;
export const emptyUi = (): UiState => ({ selected: {}, filter: {}, sort: {}, tab: {} });

let seq = 0;
const defaultId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Text a person typed → a value of the field's type. */
export function coerce(field: Field, raw: string | undefined): Value {
  const s = (raw ?? "").trim();
  switch (field.type) {
    case "number": {
      const n = Number(s.replace(/[,\s¥$€£₹%]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
    case "yesno":
      return /^(y|yes|true|1|on|done|x)$/i.test(s);
    case "choice":
      return field.values?.find((v) => v.toLowerCase() === s.toLowerCase()) ?? field.values?.[0] ?? s;
    default:
      return s;
  }
}

/** The human name of a record: its first text field (clipped, so history lines stay short). */
export function recordLabel(col: Collection, rec: Rec): string {
  const t = col.fields.find((x) => x.type === "text");
  const s = String(t ? rec[t.name] : rec.id);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

/** Bindings that still point at fields this collection has (data can be re-written under a bound tree). */
export function liveBindings(b: Record<string, string>, col: Collection): Record<string, string> {
  const has = (f: string) => col.fields.some((x) => x.name === f);
  return Object.fromEntries(
    Object.entries(b).filter(([, v]) => {
      if (v === "count" || v === "remove-selected" || v === "clear-selection" || v === "clear-filter") return true;
      const field = v.includes(":") ? v.slice(v.indexOf(":") + 1) : v;
      return has(field);
    }),
  );
}

export function visibleRecords(col: Collection, ui: UiState): Rec[] {
  const q = ui.filter[col.name]?.toLowerCase().trim();
  const filterField = ui.filter[`${col.name}:field`];
  let out = q
    ? col.records.filter((r) => (filterField ? [r[filterField]] : Object.values(r)).some((v) => String(v).toLowerCase().includes(q)))
    : col.records;
  const s = ui.sort[col.name];
  if (s) {
    out = [...out].sort((a, b) => {
      const x = a[s.field], y = b[s.field];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return s.dir === "asc" ? c : -c;
    });
  }
  return out;
}

export function aggregate(col: Collection, ui: UiState, agg: string): number {
  const recs = visibleRecords(col, ui);
  if (agg === "count") return recs.length;
  const [kind, field] = agg.split(":");
  const nums = recs.map((r) => Number(r[field])).filter((n) => Number.isFinite(n));
  const sum = nums.reduce((a, b) => a + b, 0);
  if (kind === "sum") return sum;
  if (kind === "avg") return nums.length ? Math.round((sum / nums.length) * 100) / 100 : 0;
  return 0;
}

function withCollection(state: AppState, name: string, fn: (c: Collection) => Collection | null): AppState | null {
  const cols = state.data?.collections;
  const i = cols?.findIndex((c) => c.name === name) ?? -1;
  if (!cols || i < 0) return null;
  const next = fn(cols[i]);
  if (!next) return null;
  return { ...state, data: { collections: cols.map((c, j) => (j === i ? next : c)) } };
}

const log = (s: AppState, line: string): AppState => ({ ...s, history: [...s.history, line].slice(-HISTORY_KEEP) });

export function applyOp(state: AppState, op: Op, makeId: () => string = defaultId): AppState {
  const col = state.data?.collections.find((c) => c.name === op.collection);
  if (!col) return state;
  switch (op.kind) {
    case "add": {
      const rec: Rec = { id: makeId() };
      for (const f of col.fields) rec[f.name] = coerce(f, op.values[f.name]);
      const s = withCollection(state, col.name, (c) => ({ ...c, records: [...c.records, rec] }))!;
      return log(s, `added "${recordLabel(col, rec)}" to ${col.name}`);
    }
    case "update": {
      const rec = col.records.find((r) => r.id === op.id);
      if (!rec || !col.fields.some((f) => f.name === op.field)) return state;
      const s = withCollection(state, col.name, (c) => ({ ...c, records: c.records.map((r) => (r.id === op.id ? { ...r, [op.field]: op.value } : r)) }))!;
      return log(s, `set ${op.field} to ${String(op.value).slice(0, 30)} on "${recordLabel(col, rec)}" in ${col.name}`);
    }
    case "remove": {
      const rec = col.records.find((r) => r.id === op.id);
      if (!rec) return state;
      const s = withCollection(state, col.name, (c) => ({ ...c, records: c.records.filter((r) => r.id !== op.id) }))!;
      const ui = s.ui.selected[col.name] === op.id ? { ...s.ui, selected: { ...s.ui.selected, [col.name]: null } } : s.ui;
      return log({ ...s, ui }, `removed "${recordLabel(col, rec)}" from ${col.name}`);
    }
    case "select": {
      const rec = op.id ? col.records.find((r) => r.id === op.id) : null;
      if (op.id && !rec) return state;
      const s = { ...state, ui: { ...state.ui, selected: { ...state.ui.selected, [col.name]: op.id } } };
      return log(s, rec ? `selected "${recordLabel(col, rec)}" in ${col.name}` : `cleared the selection in ${col.name}`);
    }
    case "filter": {
      const q = op.query.trim();
      const filter = { ...state.ui.filter, [col.name]: q, [`${col.name}:field`]: op.field };
      return log({ ...state, ui: { ...state.ui, filter } }, q ? `filtered ${col.name} by "${q.slice(0, 40)}"` : `cleared the filter on ${col.name}`);
    }
    case "sort": {
      const cur = state.ui.sort[col.name];
      const dir: "asc" | "desc" = cur?.field === op.field && cur.dir === "asc" ? "desc" : "asc";
      return log({ ...state, ui: { ...state.ui, sort: { ...state.ui.sort, [col.name]: { field: op.field, dir } } } }, `sorted ${col.name} by ${op.field} (${dir})`);
    }
    case "clear": {
      if (op.what === "selection") return log({ ...state, ui: { ...state.ui, selected: { ...state.ui.selected, [col.name]: null } } }, `cleared the selection in ${col.name}`);
      const filter = { ...state.ui.filter, [col.name]: "" };
      return log({ ...state, ui: { ...state.ui, filter } }, `cleared the filter on ${col.name}`);
    }
  }
}
