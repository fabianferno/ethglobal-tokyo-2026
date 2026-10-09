"use client";

import "./kit.css";
import { isContainer } from "@/lib/kit/catalog";
import { liveBindings, type Op } from "@/lib/kit/ops";
import { nodeKey } from "@/lib/kit/tree";
import type { Accent, AppState, PartType, Tree, TreeNode } from "@/lib/kit/types";
import { DetailPart, ListPart, StatRowPart, TablePart } from "./parts/data";
import { ButtonBarPart, ChecklistPart, FormPart, SearchPart } from "./parts/input";
import { BarChartPart, CalendarPart, KanbanPart, LineChartPart, NotePart, PicturePart } from "./parts/visual";
import type { PartProps } from "./parts/types";
import { useState } from "react";

export const ACCENT_CSS: Record<Accent, string> = { navy: "#0a2a8a", teal: "#0f7c7c", green: "#1f7a2e", purple: "#5b2fa6", maroon: "#8a1d2a", olive: "#5f6b12" };

const PARTS: Record<PartType, (p: PartProps) => React.ReactNode> = {
  table: TablePart, list: ListPart, detail: DetailPart, "stat-row": StatRowPart,
  form: FormPart, search: SearchPart, "button-bar": ButtonBarPart, checklist: ChecklistPart,
  "bar-chart": BarChartPart, "line-chart": LineChartPart, kanban: KanbanPart, calendar: CalendarPart, note: NotePart, picture: PicturePart,
};

function Node({ node, state, dispatch, preview }: { node: TreeNode; state: AppState; dispatch: (op: Op) => void; preview: boolean }) {
  const [tab, setTab] = useState(0);
  if (node.type === null) return <div className="kit-open sunken">Jev is deciding…</div>;
  if (isContainer(node.type)) {
    const kids = node.children ?? [];
    const child = (c: TreeNode) => (
      <div className="kit-pane" key={nodeKey(c)}>
        <Node node={c} state={state} dispatch={dispatch} preview={preview} />
      </div>
    );
    if (node.type.startsWith("tabs")) {
      return (
        <div className="kit-pane">
          <div className="tabs">
            {kids.map((c, i) => (
              <button key={c.path} className={`tab ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>
                {c.type && !isContainer(c.type) ? `${c.collection ?? c.type}` : `View ${i + 1}`}
              </button>
            ))}
          </div>
          <div className="tab-panel kit-pane">{kids[tab] && child(kids[tab])}</div>
        </div>
      );
    }
    if (node.type === "grid-4") return <div className="kit-grid">{kids.map(child)}</div>;
    return <div className={`kit ${node.type.startsWith("split-h") ? "kit-h" : "kit-v"}`}>{kids.map(child)}</div>;
  }
  const col = state.data?.collections.find((c) => c.name === node.collection) ?? null;
  const Part = PARTS[node.type];
  // Render only bindings this collection still has: data can change under a layout that was bound to it.
  const live = col && node.bindings ? { ...node, bindings: liveBindings(node.bindings, col) } : node;
  if (!col && node.type !== "picture") return <div className="kit-placeholder sunken">{node.type}{node.collection ? ` of ${node.collection}` : ""}…</div>;
  return (
    <div className="kit-part sunken kit-enter">
      <Part node={live} col={col} state={state} dispatch={dispatch} preview={preview} />
    </div>
  );
}

/** The composed app: containers nest, parts render their collection. Stable keys keep unchanged parts mounted. */
export function RenderTree({ tree, state, dispatch, preview }: { tree: Tree; state: AppState; dispatch: (op: Op) => void; preview: boolean }) {
  return (
    <div className="kit-pane" style={{ ["--accent" as string]: ACCENT_CSS[tree.accent] }} key={nodeKey(tree.root)}>
      <Node node={tree.root} state={state} dispatch={dispatch} preview={preview} />
    </div>
  );
}
