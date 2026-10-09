import { z } from "zod";
import type { Collection, Data, Field, FieldType, Rec } from "@/lib/kit/types";
import { coerce } from "@/lib/kit/ops";
import { ContentError } from "./schema";

const s = (max: number) => z.string().min(1).max(max);
export const DATA_RAW = z.object({
  collections: z
    .array(
      z.object({
        name: s(40),
        fields: z.array(z.object({ name: s(30), type: z.enum(["text", "number", "date", "yesno", "choice"]), values: z.array(s(30)).max(8) })).min(1).max(8),
        records: z.array(z.array(z.string().max(120)).max(8)).max(15),
      }),
    )
    .min(1)
    .max(4),
});

/** Gemini rejects minItems/maxItems on these nested arrays (400 INVALID_ARGUMENT), so they're dropped here; zod enforces them on the answer. */
function dropItemLimits(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(dropItemLimits);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).filter(([k]) => k !== "minItems" && k !== "maxItems").map(([k, v]) => [k, dropItemLimits(v)]));
  return o;
}
export const dataJsonSchema = () => dropItemLimits(z.toJSONSchema(DATA_RAW, { target: "draft-7", unrepresentable: "any" })) as object;

const snake = (x: string) => x.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "field";
function unique(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    return k ? `${n}_${k + 1}` : n;
  });
}

let seq = 0;
export function toData(raw: unknown): Data {
  const p = DATA_RAW.safeParse(raw);
  if (!p.success) throw new ContentError(`data: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`);
  const colNames = unique(p.data.collections.map((c) => snake(c.name)));
  const collections: Collection[] = p.data.collections.map((c, ci) => {
    const names = unique(c.fields.map((f) => snake(f.name)));
    const fields: Field[] = c.fields.map((f, i) => {
      if (f.type === "choice" && f.values.length === 0) throw new ContentError(`data: choice field ${f.name} has no values`);
      return f.type === "choice" ? { name: names[i], type: f.type as FieldType, values: f.values } : { name: names[i], type: f.type as FieldType };
    });
    const records: Rec[] = c.records.map((cells) => {
      const rec: Rec = { id: `g${(seq++).toString(36)}` };
      fields.forEach((f, i) => (rec[f.name] = coerce(f, cells[i])));
      return rec;
    });
    return { name: colNames[ci], fields, records };
  });
  return { collections };
}
