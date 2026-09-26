import type { IconName } from "@/components/win99/Icon";

/**
 * The six data shapes. Functions produce them; shells render them.
 * Any shell × function pair works as long as the shell accepts a shape the function produces.
 */

export type Fmt = "usd" | "pct" | "num" | "text" | "token";

export type Table = {
  columns: { key: string; label: string; fmt?: Fmt }[];
  rows: Record<string, string | number>[];
  /** Optional totals row, same keys as rows. */
  total?: Record<string, string | number>;
};

export type TimeSeries = { label: string; unit: "usd" | "pct"; points: number[] };

export type ListShape = {
  items: { icon?: IconName; title: string; subtitle?: string; right?: string; tone?: "up" | "down" | "warn" }[];
};

export type GridCell = { mine: boolean; risk: number; label: string };
export type RiskyGrid = {
  asset: string;
  mark: number;
  /** Row = leverage, column = entry offset from mark. */
  leverage: number[];
  offsets: number[];
  cells: GridCell[][];
};

export type Gauge = {
  value: number; // 0..1
  label: string;
  caption: string;
  forecast?: { day: string; value: number }[];
};

export type Scene = {
  headline: string;
  verdict: string;
  lines: string[];
  stats: { label: string; value: string }[];
  stamps: string[];
};

export type TxProposal = {
  kind: string;
  summary: string;
  agent: string;
  to: string;
  amount: number;
  token: string;
  network: string;
  calls: string[];
  /** 0 safe … 2 risky (Jev score). */
  risk: number;
  notes: string[];
};

export type Action = { id: string; label: string; primary?: boolean; tx?: TxProposal };

export type Bundle = {
  title: string;
  subtitle: string;
  table?: Table;
  series?: TimeSeries;
  list?: ListShape;
  grid?: RiskyGrid;
  gauge?: Gauge;
  scene?: Scene;
  /** Key/value settings shown in an app's side panel (from parsed params). */
  settings?: { label: string; value: string }[];
  actions: Action[];
};

export type ShapeKey = "table" | "series" | "list" | "grid" | "gauge" | "scene";
