import type { Op } from "@/lib/kit/ops";
import type { AppState, Collection, TreeNode } from "@/lib/kit/types";
export type PartProps = { node: TreeNode; col: Collection | null; state: AppState; dispatch: (op: Op) => void; preview: boolean };

/** "reading_list" → "reading list" */
export const nice = (name: string) => name.replace(/_/g, " ");
