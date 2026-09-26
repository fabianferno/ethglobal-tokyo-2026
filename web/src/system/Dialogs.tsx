"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/win99/Icon";
import { type AppManifest, newId } from "@/lib/compose/compose";
import type { TxProposal } from "@/lib/compose/shapes";
import { cleanLabel, ROOT } from "@/lib/ens/names";
import { fromBaseUnits } from "@/lib/sui/config";
import { type BalanceChange, executeSui, getSuiAddress, type Sponsored, sponsorSui } from "@/lib/sui/session";
import { balloon, bsod, closeWindow, getOS, installApp, isTaken, mintItem, newFolder, resolveSign, updateApp } from "@/os/store";

type SimState =
  | { status: "off" } // paper mode: no real Sui intent, or not signed in
  | { status: "loading" }
  | { status: "ready"; data: Sponsored }
  | { status: "error"; error: string };

/** AgentVault abort codes → human labels (kept in sync with move/suica_vault/sources/vault.move). */
const VAULT_ABORTS: Record<number, string> = {
  0: "not authorized",
  1: "AgentCap expired",
  2: "over per-transaction cap",
  3: "over daily cap",
  4: "recipient not allowed",
  5: "not the vault owner",
  6: "bad fee",
};
/** Detect an on-chain Move abort from an error message, e.g. "…abort code: 2…". */
function moveAbort(msg: string): { code: number; label: string } | null {
  const m = msg.match(/abort code:\s*(\d+)/i);
  if (!m) return null;
  const code = Number(m[1]);
  return { code, label: VAULT_ABORTS[code] ?? `code ${code}` };
}

/** Format a signed base-unit balance change against the paid coin's metadata (best effort). */
function fmtChange(bc: BalanceChange, tx: TxProposal): { text: string; up: boolean } {
  const isSui = bc.coinType.endsWith("::sui::SUI");
  const dec = tx.sui && bc.coinType === tx.sui.coinType ? tx.sui.decimals : isSui ? 9 : 9;
  const sym = tx.sui && bc.coinType === tx.sui.coinType ? tx.sui.symbol : isSui ? "SUI" : bc.coinType.split("::").pop() || "?";
  const v = fromBaseUnits(bc.amount, dec);
  return { text: `${v > 0 ? "+" : ""}${(+v.toFixed(6)).toString()} ${sym}`, up: v >= 0 };
}
const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/**
 * The Signing dialog is fixed OS code — never composed, never generated. Apps can only PROPOSE;
 * this is the only surface that can approve or move money. When the proposal carries a `sui` intent
 * and the user is signed in with Google, this dialog sponsors + simulates it on open (showing real
 * balance changes) and, on Approve, signs it with the zkLogin ephemeral key and executes it.
 * Otherwise it's paper mode: Approve records a plausible fake digest.
 */
export function SignDialog({ tx, reqId, winId }: { tx: TxProposal; reqId: string; winId: string }) {
  const me = getSuiAddress();
  const isReal = !!tx.sui && !!me;
  const [sim, setSim] = useState<SimState>(isReal ? { status: "loading" } : { status: "off" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isReal || !tx.sui) return;
    let live = true;
    sponsorSui(tx.sui)
      .then((data) => live && setSim({ status: "ready", data }))
      .catch((e: Error) => {
        if (!live) return;
        // An over-cap / expired / disallowed vault spend aborts on-chain during sponsorship → BSOD.
        const ab = moveAbort(e.message);
        if (ab) {
          bsod(tx.agent, "AGENT_SPEND_LIMIT_EXCEEDED", `AgentVault Move module rejected this transaction: ${ab.label} (abort code ${ab.code}). No funds moved.`);
          resolveSign(reqId, false, { error: e.message });
          closeWindow(winId);
          return;
        }
        setSim({ status: "error", error: e.message });
      });
    return () => {
      live = false;
    };
  }, [isReal, tx.sui, tx.agent, reqId, winId]);

  const risk = tx.risk < 0.6 ? { label: "Low risk", cls: "ok" } : tx.risk < 1.4 ? { label: "Medium risk", cls: "warn" } : { label: "High risk", cls: "bad" };
  const capExceeded = tx.amount > 1000;
  const reject = () => {
    resolveSign(reqId, false);
    closeWindow(winId);
  };
  const approve = async () => {
    if (isReal) {
      if (sim.status !== "ready") return;
      setBusy(true);
      try {
        const { digest } = await executeSui(sim.data);
        resolveSign(reqId, true, { digest });
      } catch (e) {
        const ab = moveAbort((e as Error).message);
        if (ab) bsod(tx.agent, "AGENT_SPEND_LIMIT_EXCEEDED", `AgentVault Move module rejected this transaction: ${ab.label} (abort code ${ab.code}). No funds moved.`);
        resolveSign(reqId, false, { error: (e as Error).message });
      }
      closeWindow(winId);
    } else {
      resolveSign(reqId, true);
      closeWindow(winId);
    }
  };
  const approveDisabled = busy || (isReal && sim.status !== "ready");

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

      {/* Real balance changes from simulating the sponsored transaction. */}
      {isReal && (
        <div className="sunken" style={{ padding: 8, background: "#fff", fontSize: 12 }}>
          <div className="muted" style={{ marginBottom: 4 }}>Balance changes (simulated)</div>
          {sim.status === "loading" && <div>Simulating on Sui…</div>}
          {sim.status === "error" && <div className="down">⚠ {sim.error}</div>}
          {sim.status === "ready" &&
            (sim.data.balanceChanges.length === 0 ? (
              <div className="muted">No balance changes reported.</div>
            ) : (
              sim.data.balanceChanges.map((bc, i) => {
                const f = fmtChange(bc, tx);
                return (
                  <div key={`${bc.coinType}:${bc.address}:${i}`} className="row" style={{ justifyContent: "space-between", padding: "1px 0" }}>
                    <span className="mono muted">{bc.address === me ? "you" : shortAddr(bc.address)}</span>
                    <b className={f.up ? "up" : "down"}>{f.text}</b>
                  </div>
                );
              })
            ))}
        </div>
      )}

      <div className="sunken mono scroll" style={{ padding: 6, fontSize: 11, background: "#fff", maxHeight: 70 }}>
        {tx.calls.map((c) => <div key={c}>▸ {c}</div>)}
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
        <span className={`badge ${risk.cls}`}>Jev: {risk.label}</span>
        <span className={`badge ${capExceeded ? "bad" : "ok"}`}>AgentCap: {capExceeded ? "over per-tx cap" : "within limits"}</span>
        {isReal ? <span className="badge ok">zkLogin · gas sponsored</span> : tx.sui ? <span className="badge warn">Paper mode — sign in with Google to send for real</span> : <span className="badge info">Counterparty screen: pending</span>}
        {tx.notes.map((n) => <span key={n} className="badge warn">{n}</span>)}
      </div>
      <div className="grow" />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn danger" onClick={reject}>Reject</button>
        <button className="btn primary" autoFocus disabled={approveDisabled} onClick={approve}>
          {busy ? "Sending…" : "Approve"}
        </button>
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
  const root = folder && folder.kind === "folder" ? folder.ens : ROOT;
  const clean = cleanLabel(label);
  const existing = s.items.find((i) => i.kind === "app" && i.app.id === app.id);
  const taken = isTaken(`${clean}.${root}`, existing?.id);
  const save = () => {
    if (taken) return;
    if (existing && existing.kind === "app" && existing.parent === (parent || null)) {
      updateApp(existing.id, { ens: `${clean}.${root}` });
      // ENS names are immutable; a rename is a new mint.
      void mintItem(existing.id);
    } else {
      installApp({ ...app, id: newId(), ens: `${clean}.${ROOT}`, owner: s.user!, published: false }, parent || null);
    }
    balloon("Saved", `${clean}.${root} — minting on ENS…`);
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
      {taken && <span className="down">⚠ {clean}.{root} is taken — first come, first served. Try another name.</span>}
      <div className="grow" />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => closeWindow(winId)}>Cancel</button>
        <button className="btn primary" disabled={!clean || taken} onClick={save}>Save</button>
      </div>
    </div>
  );
}

export function NewFolderDialog({ winId }: { winId: string }) {
  const [name, setName] = useState("workspace");
  const clean = cleanLabel(name);
  const taken = isTaken(`${clean}.${ROOT}`);
  const ok = () => {
    if (!clean || taken) return;
    newFolder(clean);
    closeWindow(winId);
  };
  return (
    <div className="col grow" style={{ padding: 12, gap: 10 }}>
      <span>A folder is a workspace: a parent ENS name with a shared treasury and spend policy.</span>
      <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok()} />
      <div className="sunken mono" style={{ padding: 6, background: "#fff" }}>{clean || "…"}.{ROOT}</div>
      {taken && <span className="down">⚠ {clean}.{ROOT} is taken — try another name.</span>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => closeWindow(winId)}>Cancel</button>
        <button className="btn primary" onClick={ok}>Create</button>
      </div>
    </div>
  );
}
