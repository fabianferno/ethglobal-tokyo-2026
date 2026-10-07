import { z } from "zod";
import type { Bundle } from "@/lib/compose/shapes";
import type { ShapeKey } from "@/lib/intent/types";

export class ContentError extends Error {}

const s = (max: number) => z.string().min(1).max(max);
const opt = (max: number) => z.string().max(max);
const head = () => ({ title: s(60), subtitle: s(120) });

/** What Gemini must return per shape. Every field required (Gemini's JSON mode is stricter with required-only objects). */
export const RAW = {
  table: z.object({
    ...head(),
    columns: z.array(z.object({ label: s(24), fmt: z.enum(["num", "pct", "text"]), unit: opt(6) })).min(1).max(8),
    rows: z.array(z.array(opt(60)).max(8)).min(1).max(12),
  }),
  list: z.object({
    ...head(),
    items: z.array(z.object({ title: s(60), subtitle: opt(120), right: opt(20), tone: z.enum(["up", "down", "warn", "none"]) })).min(1).max(10),
  }),
  series: z.object({ ...head(), label: s(40), unit: opt(6), points: z.array(z.number()).min(4).max(60) }),
  gauge: z.object({
    ...head(),
    value: z.number().min(0).max(1),
    label: s(40),
    caption: s(120),
    forecast: z.array(z.object({ day: s(12), value: z.number().min(0).max(1) })).max(7),
  }),
  scene: z.object({
    ...head(),
    headline: s(80),
    verdict: s(160),
    lines: z.array(s(140)).min(1).max(6),
    stats: z.array(z.object({ label: s(24), value: s(24) })).max(4),
    stamps: z.array(s(16)).max(3),
  }),
  grid: z.object({ ...head(), rows: z.array(z.array(z.object({ label: s(60), risk: z.number().min(0).max(1) })).min(2).max(8)).min(2).max(8) }),
  doc: z.object({ ...head(), text: s(2000) }),
  picture: z.object({ ...head(), caption: s(160) }),
} satisfies Record<ShapeKey, z.ZodObject>;

export function jsonSchemaFor(shape: ShapeKey): object {
  return z.toJSONSchema(RAW[shape], { target: "draft-7", unrepresentable: "any" });
}

const REGENERATE = { id: "regenerate", label: "Regenerate", primary: true };
/** "1,250" / "¥980" / "12%" → number; anything else stays text. */
const toNum = (cell: string) => {
  const n = Number(cell.replace(/[,\s%$¥€£₹]/g, ""));
  return cell.trim() !== "" && Number.isFinite(n) ? n : cell;
};

/** Gemini's JSON for a shape → a Bundle the shells render. Throws ContentError when it doesn't fit the shape. */
export function toBundle(shape: ShapeKey, raw: unknown): Bundle {
  const parsed = RAW[shape].safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ContentError(`${shape}: ${issue?.path.join(".")} ${issue?.message}`);
  }
  const { title, subtitle } = parsed.data;
  const base = { title, subtitle, actions: [REGENERATE] };
  switch (shape) {
    case "table": {
      const t = parsed.data as z.infer<typeof RAW.table>;
      const columns = t.columns.map((c, i) => ({ key: `c${i}`, label: c.label, fmt: c.fmt, ...(c.unit ? { unit: c.unit } : {}) }));
      const rows = t.rows.map((row) => Object.fromEntries(columns.map((c, i) => [c.key, c.fmt === "text" ? (row[i] ?? "") : toNum(row[i] ?? "")])));
      return { ...base, table: { columns, rows } };
    }
    case "list": {
      const l = parsed.data as z.infer<typeof RAW.list>;
      return {
        ...base,
        list: {
          items: l.items.map((it) => ({
            title: it.title,
            ...(it.subtitle ? { subtitle: it.subtitle } : {}),
            ...(it.right ? { right: it.right } : {}),
            ...(it.tone !== "none" ? { tone: it.tone } : {}),
          })),
        },
      };
    }
    case "series": {
      const x = parsed.data as z.infer<typeof RAW.series>;
      return { ...base, series: { label: x.label, unit: x.unit, points: x.points } };
    }
    case "gauge": {
      const g = parsed.data as z.infer<typeof RAW.gauge>;
      return { ...base, gauge: { value: g.value, label: g.label, caption: g.caption, forecast: g.forecast } };
    }
    case "scene": {
      const x = parsed.data as z.infer<typeof RAW.scene>;
      return { ...base, scene: { headline: x.headline, verdict: x.verdict, lines: x.lines, stats: x.stats, stamps: x.stamps } };
    }
    case "grid": {
      const x = parsed.data as z.infer<typeof RAW.grid>;
      const width = Math.min(...x.rows.map((row) => row.length));
      const cells = x.rows.map((row) => row.slice(0, width).map((c) => ({ label: c.label, risk: c.risk, mine: c.risk > 0.72 })));
      return { ...base, grid: { asset: title, mark: 0, leverage: cells.map((_, i) => i + 1), offsets: cells[0].map((_, i) => i + 1), cells } };
    }
    case "doc":
      return { ...base, doc: { text: (parsed.data as z.infer<typeof RAW.doc>).text } };
    case "picture":
      return { ...base, list: { items: [{ title: (parsed.data as z.infer<typeof RAW.picture>).caption }] } };
  }
}
