"use client";

import type { Fmt, Table } from "@/lib/compose/shapes";
import { usd } from "@/lib/chain/mock";

export function fmt(v: string | number | undefined, f: Fmt = "text") {
  if (v === undefined || v === "") return "";
  if (typeof v === "string") return v;
  if (f === "usd") return usd(v);
  if (f === "pct") return `${v.toFixed(1)}%`;
  if (f === "num") return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(v);
}

const tone = (key: string, v: unknown) =>
  typeof v === "number" && /pnl|change|bal/.test(key) ? (v > 0 ? "up" : v < 0 ? "down" : "") : "";

export function ListView({ table, selected, onSelect }: { table: Table; selected?: number; onSelect?: (i: number) => void }) {
  return (
    <div className="listview sunken grow">
      <table>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.key} className={c.fmt && c.fmt !== "text" ? "num" : ""}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className={selected === i ? "sel" : ""} onClick={() => onSelect?.(i)}>
              {table.columns.map((c) => (
                <td key={c.key} className={`${c.fmt && c.fmt !== "text" ? "num" : ""} ${tone(c.key, r[c.key])}`}>{fmt(r[c.key], c.fmt)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Segmented blue progress bar from the kit. */
export function Progress({ value, width = 220 }: { value: number; width?: number }) {
  const segs = Math.max(0, Math.round(((width - 6) / 12) * Math.min(1, Math.max(0, value))));
  return (
    <div className="progress sunken" style={{ width }} role="progressbar" aria-valuenow={Math.round(value * 100)}>
      {Array.from({ length: segs }, (_, i) => <div key={i} className="seg" />)}
    </div>
  );
}

export function LineChart({ points, width = 360, height = 120, color = "var(--primary-b)", fill = true }: { points: number[]; width?: number; height?: number; color?: string; fill?: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const x = (i: number) => (i / (points.length - 1)) * (width - 8) + 4;
  const y = (v: number) => height - 6 - ((v - min) / (max - min || 1)) * (height - 14);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={width} y1={height * f} y2={height * f} stroke="#d8d6d2" />)}
      {fill && <path d={`${d}L${x(points.length - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity=".15" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BarChart({ values, labels, height = 140 }: { values: number[]; labels: string[]; height?: number }) {
  const max = Math.max(...values.map(Math.abs), 1);
  const colors = ["var(--pal-navy)", "var(--pal-green)", "var(--pal-red)", "var(--pal-yellow)", "var(--pal-purple)", "var(--pal-teal)", "var(--pal-cornflower)", "var(--pal-gray3)"];
  const w = 100 / values.length;
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {values.map((v, i) => {
        const h = (Math.abs(v) / max) * (height - 22);
        return (
          <g key={i}>
            <rect x={i * w + w * 0.18} y={height - 16 - h} width={w * 0.64} height={h} fill={colors[i % colors.length]} stroke="#1b1b1b" strokeWidth=".3" />
            <text x={i * w + w / 2} y={height - 4} fontSize="7" textAnchor="middle" fill="#333">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function GroupBox({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <fieldset className="groupbox" style={style}>
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}
