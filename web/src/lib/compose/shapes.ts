import type { IconName } from "@/components/win99/Icon";

/**
 * Data shapes. Gemini fills them (lib/content); shells render them.
 * Any shell × shape works as long as the shell accepts the shape (adapters in ./adapt.ts help).
 */

export type Fmt = "num" | "pct" | "text";

export type Table = {
  columns: { key: string; label: string; fmt?: Fmt; unit?: string }[];
  rows: Record<string, string | number>[];
};

export type TimeSeries = { label: string; unit: string; points: number[] };

export type ListShape = {
  items: { icon?: IconName; title: string; subtitle?: string; right?: string; tone?: "up" | "down" | "warn" }[];
};

export type GridCell = { mine: boolean; risk: number; label: string };
export type RiskyGrid = {
  asset: string;
  mark: number;
  /** Row and column indices (the names are from the Minesweeper/Doom shells' original leverage grid). */
  leverage: number[];
  offsets: number[];
  cells: GridCell[][];
};

export type Gauge = { value: number; label: string; caption: string; forecast?: { day: string; value: number }[] };

export type Scene = { headline: string; verdict: string; lines: string[]; stats: { label: string; value: string }[]; stamps: string[] };

export type Doc = { text: string };

export type Action = { id: string; label: string; primary?: boolean };

export type Bundle = {
  title: string;
  subtitle: string;
  table?: Table;
  series?: TimeSeries;
  list?: ListShape;
  grid?: RiskyGrid;
  gauge?: Gauge;
  scene?: Scene;
  doc?: Doc;
  actions: Action[];
};
