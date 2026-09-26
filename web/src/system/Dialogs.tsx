"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/win99/Icon";
import { type AppManifest, newId } from "@/lib/compose/compose";
import type { TxProposal } from "@/lib/compose/shapes";
import { balloon, closeWindow, getOS, installApp, newFolder, resolveSign, updateApp } from "@/os/store";

/**
 * The Signing dialog is fixed OS code — never composed, never generated. Apps can only PROPOSE;
 * this is the only surface that can approve. (Next: live Intercepta screen + AgentCap check.)
 */
export function SignDialog({ tx, reqId, winId }: { tx: TxProposal; reqId: string; winId: string }) {
  const risk = tx.risk < 0.6 ? { label: "Low risk", cls: "ok" } : tx.risk < 1.4 ? { label: "Medium risk", cls: "warn" } : { label: "High risk", cls: "bad" };
  const capExceeded = tx.amount > 1000;
  const done = (ok: boolean) => {
    resolveSign(reqId, ok);
    closeWindow(winId);
  };
  return (
    <div className="col grow" style={{ padding: 10, gap: 8 }}>
      <div className="row" style={{ gap: 12 }}>
        <Icon name={tx.risk >= 1.4 ? "warning" : "lock"} size={40} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{tx.kind}</div>
          <div>{tx.summary}</div>
        </div>
      </div>
      <div className="sunken" style={{ padding: 8, background: "#fff" }}>
        {[
          ["Agent", tx.agent],
          ["To", tx.to],
          ["Amount", tx.amount ? `${tx.amount.toLocaleString()} ${tx.token}` : "—"],
          ["Network", `${tx.network} · gas sponsored`],
        ].map(([k, v]) => (
          <div key={k} className="row" style={{ justifyContent: "space-between", padding: "2px 0" }}>
            <span className="muted">{k}</span>
            <b style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</b>
          </div>
        ))}
      </div>
      <div className="sunken mono scroll" style={{ padding: 6, fontSize: 11, background: "#fff", maxHeight: 80 }}>
        {tx.calls.map((c) => <div key={c}>▸ {c}</div>)}
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
        <span className={`badge ${risk.cls}`}>Jev: {risk.label}</span>
        <span className={`badge ${capExceeded ? "bad" : "ok"}`}>AgentCap: {capExceeded ? "over per-tx cap" : "within limits"}</span>
        <span className="badge info">Counterparty screen: pending</span>
        {tx.notes.map((n) => <span key={n} className="badge warn">{n}</span>)}
      </div>
      <div className="grow" />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn danger" onClick={() => done(false)}>Reject</button>
        <button className="btn primary" autoFocus onClick={() => done(true)}>Approve</button>
      </div>
    </div>
  );
}

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

/** Save As = mint a subname. The name you type becomes this agent's ENS identity. */
export function SaveAsDialog({ app, winId }: { app: AppManifest; winId: string }) {
  const s = getOS();
  const folders = s.items.filter((i) => i.kind === "folder");
  const [label, setLabel] = useState(app.ens.split(".")[0]);
  const [parent, setParent] = useState<string>("");
  const folder = folders.find((f) => f.id === parent);
  const root = folder && folder.kind === "folder" ? folder.ens : s.user;
  const clean = label.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const save = () => {
    const existing = s.items.find((i) => i.kind === "app" && i.app.id === app.id);
    if (existing && existing.kind === "app" && existing.parent === (parent || null)) {
      updateApp(existing.id, { ens: `${clean}.${root}` });
    } else {
      installApp({ ...app, id: newId(), ens: `${clean}.${root}`, owner: s.user!, published: false }, parent || null);
    }
    balloon("Saved", `${clean}.${root} — subname registered (local; ENSv2 Sepolia next)`);
    closeWindow(winId);
  };
  return (
    <div className="col grow" style={{ padding: 12, gap: 10 }}>
      <label className="row">
        <span style={{ width: 70 }}>Save in:</span>
        <select className="field grow" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Desktop ({s.user})</option>
          {folders.map((f) => f.kind === "folder" && <option key={f.id} value={f.id}>{f.ens}</option>)}
        </select>
      </label>
      <label className="row">
        <span style={{ width: 70 }}>Name:</span>
        <input className="field grow" value={label} autoFocus onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && clean && save()} />
      </label>
      <div className="sunken mono" style={{ padding: 6, background: "#fff" }}>{clean || "…"}.{root}</div>
      <div className="grow" />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => closeWindow(winId)}>Cancel</button>
        <button className="btn primary" disabled={!clean} onClick={save}>Save</button>
      </div>
    </div>
  );
}

export function NewFolderDialog({ winId }: { winId: string }) {
  const [name, setName] = useState("workspace");
  const user = getOS().user;
  const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const ok = () => {
    if (!clean) return;
    newFolder(clean);
    closeWindow(winId);
  };
  return (
    <div className="col grow" style={{ padding: 12, gap: 10 }}>
      <span>A folder is a workspace: a parent ENS name with a shared treasury and spend policy.</span>
      <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok()} />
      <div className="sunken mono" style={{ padding: 6, background: "#fff" }}>{clean || "…"}.{user}</div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => closeWindow(winId)}>Cancel</button>
        <button className="btn primary" onClick={ok}>Create</button>
      </div>
    </div>
  );
}
