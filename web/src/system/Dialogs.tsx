"use client";

import { Icon, type IconName } from "@/components/win99/Icon";
import { closeWindow } from "@/os/store";

/** The generic Win98 message box. */
export function MessageBox({ icon, text, detail, winId }: { icon: IconName; text: string; detail?: string; winId: string }) {
  return (
    <div className="col grow" style={{ padding: 12, gap: 10 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <Icon name={icon} size={36} />
        <div className="grow selectable" style={{ whiteSpace: "pre-wrap" }}>
          {text}
          {detail && <div className="mono muted" style={{ fontSize: 11, marginTop: 6, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap" }}>{detail}</div>}
        </div>
      </div>
      <div className="grow" />
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn" autoFocus onClick={() => closeWindow(winId)}>OK</button>
      </div>
    </div>
  );
}
