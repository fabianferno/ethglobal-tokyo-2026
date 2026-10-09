import { collectionText } from "@/lib/kit/catalog";
import { recordLabel } from "@/lib/kit/ops";
import { treeText } from "@/lib/kit/tree";
import type { AppState, Tree } from "@/lib/kit/types";

/** Everything Jev sees for one call, as compact text. Sample rows, not all rows. */
export function describe(state: AppState, tree: Tree, prev: Tree | null): string {
  const lines = [`App: "${state.prompt}"`];
  if (state.data) {
    lines.push("Data:");
    for (const c of state.data.collections) {
      const n = c.records.length;
      lines.push(`- ${collectionText(c).replace(`${c.name}:`, `${c.name} (${n} record${n === 1 ? "" : "s"}):`)}`);
      for (const r of c.records.slice(0, 3)) lines.push(`  e.g. ${c.fields.map((f) => `${f.name}=${String(r[f.name])}`).join(", ")}`);
    }
    const ui: string[] = [];
    for (const c of state.data.collections) {
      const sel = state.ui.selected[c.name];
      const rec = sel ? c.records.find((r) => r.id === sel) : null;
      if (rec) ui.push(`selected "${recordLabel(c, rec)}" in ${c.name}`);
      if (state.ui.filter[c.name]) ui.push(`${c.name} filtered by "${state.ui.filter[c.name]}"`);
      const s = state.ui.sort[c.name];
      if (s) ui.push(`${c.name} sorted by ${s.field} ${s.dir}`);
    }
    if (ui.length) lines.push(`Now: ${ui.join("; ")}`);
  } else lines.push("Data: not written yet (design the layout from the request alone).");
  if (state.history.length) lines.push("Recent:", ...state.history.slice(-5).map((h) => `- ${h}`));
  if (prev) lines.push(`Previous layout: ${treeText(prev)}`);
  lines.push(`Layout so far: ${treeText(tree)}`);
  return lines.join("\n");
}
