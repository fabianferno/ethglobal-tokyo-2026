"use client";

import { useState } from "react";
import { fmt } from "@/components/win99/Widgets";
import type { ShellProps } from "./AppFrame";

/** Notepad shell: a document, or a list/table turned into plain text you can actually edit. */
export function NotepadShell({ bundle, preview }: ShellProps) {
  const initial = () => {
    const head = `${bundle.title}\n${"=".repeat(bundle.title.length)}\n${bundle.subtitle}\n\n`;
    if (bundle.doc) return head + bundle.doc.text;
    if (bundle.list) return head + bundle.list.items.map((i) => `${i.title}${i.right ? `   ${i.right}` : ""}${i.subtitle ? `\n    ${i.subtitle}` : ""}`).join("\n");
    if (bundle.table) {
      const t = bundle.table;
      return head + t.rows.map((r) => t.columns.map((c) => fmt(r[c.key], c.fmt, c.unit).padEnd(12)).join(" ")).join("\n");
    }
    return head;
  };
  const [text, setText] = useState(initial);
  return (
    <textarea
      className="field grow mono selectable"
      spellCheck={false}
      readOnly={preview}
      value={text}
      onChange={(e) => setText(e.target.value)}
      style={{ width: "100%", fontSize: 13, lineHeight: 1.45, padding: 8, whiteSpace: "pre", minHeight: 0 }}
    />
  );
}
