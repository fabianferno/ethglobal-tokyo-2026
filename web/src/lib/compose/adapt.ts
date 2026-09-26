import type { Bundle, Gauge, GridCell, RiskyGrid } from "./shapes";

/**
 * Shape adapters: let any shell render any function by deriving the shape it needs from whatever the
 * function produced. This is what makes "minesweeper but LP" or "weather but portfolio" honor the
 * named shell instead of falling back to Explorer. Deterministic, no model call.
 */

/** All the numbers a bundle carries, for shells that only need a magnitude. */
function numbersOf(b: Bundle): number[] {
  if (b.series) return b.series.points;
  if (b.table) return b.table.rows.flatMap((r) => Object.values(r).filter((v): v is number => typeof v === "number"));
  if (b.gauge) return [b.gauge.value];
  return [];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A 0..1 gauge from any bundle — the last value's position within its range (Weather, etc.). */
export function toGauge(b: Bundle): Gauge {
  if (b.gauge) return b.gauge;
  const nums = numbersOf(b);
  let v = 0.5;
  if (nums.length) {
    const min = Math.min(...nums), max = Math.max(...nums);
    v = max > min ? (nums[nums.length - 1] - min) / (max - min) : clamp01(Math.abs(nums[0]));
  }
  return { value: clamp01(v), label: b.title, caption: b.subtitle };
}

/** A minefield from any bundle — data magnitudes become cell risk; the biggest are the mines. */
export function toGrid(b: Bundle): RiskyGrid {
  if (b.grid) return b.grid;
  const vals = numbersOf(b).map(Math.abs).filter((n) => Number.isFinite(n));
  const src = vals.length ? vals : [0.2, 0.4, 0.6, 0.3, 0.5, 0.7, 0.45, 0.55, 0.35, 0.65, 0.25, 0.5];
  const max = Math.max(...src, 1e-6);
  const cols = 6;
  const rows = Math.max(2, Math.min(8, Math.ceil(src.length / cols)));
  const cells: GridCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const risk = clamp01(0.05 + (src[i % src.length] / max) * 0.9);
      row.push({ mine: risk > 0.72, risk, label: `${b.title} · cell ${i + 1} — ${(risk * 100).toFixed(0)}% risk` });
    }
    cells.push(row);
  }
  return {
    asset: b.title,
    mark: 0,
    leverage: Array.from({ length: rows }, (_, i) => i + 1),
    offsets: Array.from({ length: cols }, (_, i) => i + 1),
    cells,
  };
}
