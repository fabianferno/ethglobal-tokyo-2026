import type { Collection, ContainerType, FieldType, NodeType, PartType } from "./types";

/** A binding slot on a part: a field of given types, an aggregate, or a button operation. */
export type SlotSpec = { name: string; kind: "field" | "agg" | "button"; types?: FieldType[]; optional: boolean; question: string };

export const CONTAINER_INFO: Record<ContainerType, { children: number; description: string }> = {
  "split-h-2": { children: 2, description: "Two panes side by side, e.g. the items on the left and the selected item or an add form on the right" },
  "split-h-3": { children: 3, description: "Three panes side by side, e.g. a list, the selected item, and an add form" },
  "split-v-2": { children: 2, description: "Two panes stacked, e.g. headline numbers or a chart on top and the items below" },
  "split-v-3": { children: 3, description: "Three stacked panes, e.g. headline numbers, a chart, then the items" },
  "tabs-2": { children: 2, description: "Two tabs, one visible at a time, e.g. the items and a way to add one" },
  "tabs-3": { children: 3, description: "Three tabs, one visible at a time, e.g. different views of the same data" },
  "grid-4": { children: 4, description: "A 2x2 dashboard of four panes, e.g. numbers, a chart, the items and an add form" },
};

const ANY: FieldType[] = ["text", "number", "date", "yesno", "choice"];
const f = (name: string, types: FieldType[], optional: boolean, question: string): SlotSpec => ({ name, kind: "field", types, optional, question });

export const PART_INFO: Record<PartType, { description: string; needsCollection: boolean; slots: SlotSpec[] }> = {
  table: { description: "A table with columns, best for comparing many items across several fields at a glance", needsCollection: true, slots: [f("col1", ANY, false, "first column"), f("col2", ANY, true, "second column"), f("col3", ANY, true, "third column"), f("col4", ANY, true, "fourth column")] },
  list: { description: "A simple list to browse items and pick one; pairs well with a detail view", needsCollection: true, slots: [f("title", ["text"], false, "item title"), f("subtitle", ANY, true, "item subtitle")] },
  detail: { description: "Shows everything about the item picked in a list or table, for reading one item closely", needsCollection: true, slots: [] },
  form: { description: "The way to add new items: input fields and an Add button. Apps that track or collect things need one", needsCollection: true, slots: [f("field1", ANY, false, "first input"), f("field2", ANY, true, "second input"), f("field3", ANY, true, "third input"), f("field4", ANY, true, "fourth input")] },
  "stat-row": { description: "One to three big headline numbers (count, total, average) that sum up the data, like a dashboard", needsCollection: true, slots: [{ name: "agg1", kind: "agg", optional: false, question: "first number" }, { name: "agg2", kind: "agg", optional: true, question: "second number" }, { name: "agg3", kind: "agg", optional: true, question: "third number" }] },
  "bar-chart": { description: "A bar chart comparing a number across items", needsCollection: true, slots: [f("label", ["text", "choice"], false, "bar labels"), f("value", ["number"], false, "bar values")] },
  "line-chart": { description: "A line chart of a number over time or order, for trends", needsCollection: true, slots: [f("value", ["number"], false, "the number to plot"), f("order", ["date"], true, "the time axis")] },
  kanban: { description: "Cards in columns by status that can be dragged between columns, for work that moves through stages", needsCollection: true, slots: [f("column", ["choice"], false, "which field makes the columns"), f("title", ["text"], false, "card title")] },
  checklist: { description: "Items with checkboxes to tick off, for to-dos and things done or not done", needsCollection: true, slots: [f("title", ["text"], false, "item title"), f("done", ["yesno"], false, "the done checkbox")] },
  calendar: { description: "A month calendar with items on their dates", needsCollection: true, slots: [f("date", ["date"], false, "the date of each item"), f("title", ["text"], false, "item title")] },
  search: { description: "A search box to quickly find items when there are many", needsCollection: true, slots: [f("field", ["text", "choice"], false, "the field to search")] },
  "button-bar": { description: "One to three buttons that act on a collection (remove, clear, sort)", needsCollection: true, slots: [{ name: "btn1", kind: "button", optional: false, question: "first button" }, { name: "btn2", kind: "button", optional: true, question: "second button" }, { name: "btn3", kind: "button", optional: true, question: "third button" }] },
  note: { description: "A paragraph of text, like notes, a description or a summary", needsCollection: true, slots: [f("text", ["text"], false, "the text to show")] },
  picture: { description: "A picture of the app's subject, for mood or decoration", needsCollection: false, slots: [] },
};

export const isContainer = (t: NodeType): t is ContainerType => t in CONTAINER_INFO;
export const childCount = (t: ContainerType) => CONTAINER_INFO[t].children;

/** The options a slot offers for this collection: type-filtered fields, aggregates or button ops, plus "none" if optional. */
export function slotOptions(slot: SlotSpec, col: Collection): string[] {
  let out: string[];
  if (slot.kind === "field") out = col.fields.filter((x) => slot.types!.includes(x.type)).map((x) => x.name);
  else if (slot.kind === "agg") out = ["count", ...col.fields.filter((x) => x.type === "number").flatMap((x) => [`sum:${x.name}`, `avg:${x.name}`])];
  else out = ["remove-selected", "clear-selection", "clear-filter", ...col.fields.filter((x) => x.type !== "yesno").map((x) => `sort:${x.name}`)];
  return slot.optional ? [...out, "none"] : out;
}

/** Every required slot has at least one option. */
export function canBind(part: PartType, col: Collection): boolean {
  return PART_INFO[part].slots.every((s) => s.optional || slotOptions(s, col).length > 0);
}

/** "expenses: item (text), amount (number), category (choice: food, travel)" */
export function collectionText(col: Collection): string {
  return `${col.name}: ${col.fields.map((x) => `${x.name} (${x.type}${x.values ? `: ${x.values.join(", ")}` : ""})`).join(", ")}`;
}
