import { PART_INFO, slotOptions } from "@/lib/kit/catalog";
import { emptyTree, setNode } from "@/lib/kit/tree";
import type { AppState, Bindings, PartType, Tree } from "@/lib/kit/types";

/** When the Decisions API can't answer: a sensible, complete tree built by rules. */
export function fallbackTree(state: AppState): Tree {
  const col = state.data?.collections[0];
  const hasChoice = !!col?.fields.some((f) => f.type === "choice");
  const [a, b]: PartType[] = hasChoice ? ["list", "detail"] : ["table", "form"];
  let t = setNode(emptyTree(), "root", { type: "split-h-2" });
  if (!col) {
    t = setNode(t, "root.0", { type: a });
    return setNode(t, "root.1", { type: b });
  }
  const bind = (part: PartType): Bindings => {
    const out: Bindings = {};
    for (const slot of PART_INFO[part].slots) {
      const first = slotOptions(slot, col).find((o) => o !== "none" && !Object.values(out).includes(o));
      if (first && (!slot.optional || Object.keys(out).length < 2)) out[slot.name] = first;
    }
    return out;
  };
  t = setNode(t, "root.0", { type: a, collection: col.name, bindings: bind(a) });
  t = setNode(t, "root.1", { type: b, collection: col.name, bindings: bind(b) });
  return { ...t, bound: true };
}
