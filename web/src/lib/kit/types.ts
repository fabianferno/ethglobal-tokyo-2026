/** The kit's vocabulary: an app's data and state, and the UI tree the Decisions API composes. */

export type FieldType = "text" | "number" | "date" | "yesno" | "choice";
export type Field = { name: string; type: FieldType; values?: string[] };
export type Value = string | number | boolean;
export type Rec = { id: string; [field: string]: Value };
export type Collection = { name: string; fields: Field[]; records: Rec[] };
export type Data = { collections: Collection[] };

export type UiState = {
  selected: Record<string, string | null>;
  filter: Record<string, string>;
  sort: Record<string, { field: string; dir: "asc" | "desc" }>;
  tab: Record<string, number>;
};
export type AppState = { prompt: string; data: Data | null; ui: UiState; history: string[] };

export const CONTAINERS = ["split-h-2", "split-h-3", "split-v-2", "split-v-3", "tabs-2", "tabs-3", "grid-4"] as const;
export type ContainerType = (typeof CONTAINERS)[number];
export const PARTS = ["table", "list", "detail", "form", "stat-row", "bar-chart", "line-chart", "kanban", "checklist", "calendar", "search", "button-bar", "note", "picture"] as const;
export type PartType = (typeof PARTS)[number];
export type NodeType = ContainerType | PartType;

/** slot name → chosen option (a field name, an aggregate like "sum:amount", or a button op). "none" is never stored. */
export type Bindings = Record<string, string>;
/** `type: null` = still open (not decided yet). Paths: "root", "root.0", "root.0.1". */
export type TreeNode = { path: string; type: NodeType | null; collection?: string; bindings?: Bindings; children?: TreeNode[] };
export const ACCENTS = ["navy", "teal", "green", "purple", "maroon", "olive"] as const;
export type Accent = (typeof ACCENTS)[number];
export type Tree = { root: TreeNode; accent: Accent; nonsense: number; bound: boolean };
