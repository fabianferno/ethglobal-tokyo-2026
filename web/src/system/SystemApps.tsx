"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/win99/Icon";
import { MenuBar, ToolButton, Toolbar } from "@/components/win99/Menu";
import { LineChart, ListView, Progress } from "@/components/win99/Widgets";
import { rng, usd } from "@/lib/chain/mock";
import type { AppManifest } from "@/lib/compose/compose";
import { PUBLISHED } from "@/lib/compose/registry";
import {
  balloon,
  bsod,
  type DesktopItem,
  emptyTrash,
  message,
  moveIntoFolder,
  openApp,
  openFolder,
  openSystem,
  trashItem,
  useOS,
} from "@/os/store";

/** Mock agent wallet balance — replaced by Sui RPC / MultiBaas reads. */
export function agentBalance(ens: string) {
  const r = rng(ens + ":bal");
  return { usdc: Math.round(20 + r() * 1800), sui: Math.round(r() * 400), cap: 500 };
}

function useApps() {
  const items = useOS((s) => s.items);
  return useMemo(() => items.filter((i): i is Extract<DesktopItem, { kind: "app" }> => i.kind === "app"), [items]);
}

/* ── Task Manager: the digital-asset dashboard (Curvegrid track) ── */

export function TaskManager() {
  const apps = useApps();
  const activity = useOS((s) => s.activity);
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState<number | undefined>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const total = apps.reduce((a, x) => a + agentBalance(x.app.ens).usdc, 0);
  const spendSeries = useMemo(() => {
    const r = rng(String(activity.length));
    return Array.from({ length: 40 }, (_, i) => 10 + r() * 30 + (i > 34 ? activity.length * 4 : 0));
    // tick drives the "live" wobble
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.length, tick]);

  const selected = sel !== undefined ? apps[sel] : undefined;

  return (
    <div className="col grow" style={{ padding: 4, minHeight: 0 }}>
      <MenuBar
        menus={[
          { label: "File", items: [{ label: "New Task (Start)…", onClick: () => balloon("Tip", "Press the Start button and describe an app.") }] },
          {
            label: "Options",
            items: [
              {
                label: "Simulate rogue agent",
                icon: "bomb",
                onClick: () => bsod(selected?.app.ens ?? apps[0]?.app.ens ?? "rogue.agent.eth", "AGENT_SPEND_LIMIT_EXCEEDED", "Attempted transfer of 25,000 USDC exceeds AgentCap per_day=500"),
              },
            ],
          },
        ]}
      />
      <div className="tabs" style={{ marginTop: 6 }}>
        {["Agents", "Performance", "Activity"].map((t, i) => (
          <button key={t} className={`tab ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      <div className="tab-panel col" style={{ gap: 6 }}>
        {tab === 0 && (
          <>
            <ListView
              selected={sel}
              onSelect={setSel}
              table={{
                columns: [
                  { key: "ens", label: "Agent (ENS)" },
                  { key: "fn", label: "Function" },
                  { key: "status", label: "Status" },
                  { key: "usdc", label: "USDC", fmt: "usd" },
                  { key: "sui", label: "SUI", fmt: "num" },
                  { key: "cap", label: "Cap/day", fmt: "usd" },
                ],
                rows: apps.map((a) => {
                  const b = agentBalance(a.app.ens);
                  return { ens: a.app.ens, fn: a.app.fn, status: a.app.readOnly ? "Watching" : "Running", usdc: b.usdc, sui: b.sui, cap: b.cap };
                }),
              }}
            />
            <div className="row">
              <span className="grow">{apps.length} agents · {usd(total)} under management</span>
              <button className="btn" disabled={!selected} onClick={() => selected && openApp(selected.app)}>Switch To</button>
              <button
                className="btn danger"
                disabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  trashItem(selected.id);
                  balloon("Process ended", `AgentCap for ${selected.app.ens} revoked.`);
                  setSel(undefined);
                }}
              >
                End Process
              </button>
            </div>
          </>
        )}
        {tab === 1 && (
          <div className="col grow" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: "stretch" }}>
              <Meter label="Treasury" value={usd(total)} />
              <Meter label="Agents" value={String(apps.length)} />
              <Meter label="Tx today" value={String(activity.filter((a) => a.status === "ok").length)} />
              <Meter label="Blocked" value={String(activity.filter((a) => a.status !== "ok").length)} />
            </div>
            <b>Agent spend / min</b>
            <div className="sunken" style={{ background: "#000", padding: 2 }}>
              <LineChart points={spendSeries} height={130} color="#3aff6a" fill={false} />
            </div>
            <b>Allocation by agent</b>
            <div className="col" style={{ gap: 4 }}>
              {apps.slice(0, 6).map((a) => (
                <div key={a.id} className="row">
                  <span style={{ width: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{a.app.ens}</span>
                  <Progress value={agentBalance(a.app.ens).usdc / Math.max(1, total)} width={260} />
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 2 && (
          <ListView
            table={{
              columns: [
                { key: "t", label: "Time" },
                { key: "agent", label: "Agent" },
                { key: "kind", label: "Action" },
                { key: "amt", label: "Amount" },
                { key: "status", label: "Status" },
                { key: "digest", label: "Digest" },
              ],
              rows: activity.map((a) => ({
                t: new Date(a.t).toLocaleTimeString(),
                agent: a.agent,
                kind: a.kind,
                amt: a.amount ? `${a.amount} ${a.token}` : "—",
                status: a.status === "ok" ? "✓ Sent" : a.status === "denied" ? "✕ Rejected" : "⛔ Blocked",
                digest: a.digest ? `${a.digest.slice(0, 10)}…` : "",
              })),
            }}
          />
        )}
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: string }) {
  return (
    <div className="sunken col" style={{ flex: 1, padding: 6, background: "#000", color: "#3aff6a", gap: 2 }}>
      <span style={{ fontSize: 11, color: "#9fe8b3" }}>{label}</span>
      <b className="mono" style={{ fontSize: 18 }}>{value}</b>
    </div>
  );
}

/* ── My Computer: every agent wallet is a drive ── */

export function MyComputer() {
  const apps = useApps();
  const user = useOS((s) => s.user)!;
  const drives = [{ ens: user, label: "Treasury", icon: "drive" as const }, ...apps.map((a) => ({ ens: a.app.ens, label: a.app.title, icon: a.app.icon, app: a.app }))];
  return (
    <div className="col grow" style={{ minHeight: 0 }}>
      <Toolbar>
        <ToolButton icon="task" label="Task Mgr" onClick={() => openSystem("taskmgr")} />
        <ToolButton icon="network" label="Network" onClick={() => openSystem("network")} />
      </Toolbar>
      <div className="sunken grow scroll" style={{ margin: 4, padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, alignContent: "start" }}>
        {drives.map((d, i) => {
          const b = agentBalance(d.ens);
          const letter = String.fromCharCode(67 + i);
          return (
            <button key={d.ens} className="row" style={{ background: "none", border: "1px dotted transparent", padding: 6, textAlign: "left", cursor: "pointer" }} onDoubleClick={() => "app" in d && d.app && openApp(d.app)}>
              <Icon name={d.icon} size={40} />
              <div className="col" style={{ gap: 3, minWidth: 0 }}>
                <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{d.label} ({letter}:)</b>
                <Progress value={b.usdc / 2000} width={170} />
                <span className="muted" style={{ fontSize: 11 }}>{usd(b.usdc)} USDC · {b.sui} SUI</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="statusbar"><div>{drives.length} wallet(s)</div><div>Sui Testnet</div></div>
    </div>
  );
}

/* ── Network Neighborhood: other people's published agents, by ENS name ── */

export function NetworkNeighborhood() {
  const items = useOS((s) => s.items);
  const index = useMemo(() => [...items.flatMap((i) => (i.kind === "app" && i.app.published ? [i.app] : [])), ...PUBLISHED], [items]);
  const owners = useMemo(() => {
    const m = new Map<string, AppManifest[]>();
    for (const a of index) m.set(a.owner, [...(m.get(a.owner) ?? []), a]);
    return [...m.entries()];
  }, [index]);
  const [owner, setOwner] = useState(0);
  const [lookup, setLookup] = useState("");
  const current = owners[owner];
  return (
    <div className="col grow" style={{ minHeight: 0 }}>
      <div className="row" style={{ padding: 4, gap: 6 }}>
        <span>Address</span>
        <input className="field grow" placeholder="type an ENS name, e.g. kenji.eth" value={lookup} onChange={(e) => setLookup(e.target.value)} onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const i = owners.findIndex(([o]) => o.includes(lookup.trim().toLowerCase()));
          if (i >= 0) setOwner(i);
          else message("Network", "network", `No published agents found under ${lookup}.`);
        }} />
      </div>
      <div className="row grow" style={{ alignItems: "stretch", gap: 4, padding: 4, minHeight: 0 }}>
        <div className="sunken scroll" style={{ width: 210, flex: "none", background: "#fff", padding: 4 }}>
          <div className="row" style={{ gap: 4, fontWeight: 700 }}><Icon name="globe" size={18} /> Entire Network</div>
          {owners.map(([o, apps], i) => (
            <button key={o} className={`menu-item ${i === owner ? "hot" : ""}`} style={{ paddingLeft: 18 }} onClick={() => setOwner(i)}>
              <Icon name="computer" size={18} /> {o} <span style={{ marginLeft: "auto", opacity: 0.7 }}>{apps.length}</span>
            </button>
          ))}
        </div>
        <div className="sunken grow scroll" style={{ background: "#fff", padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, alignContent: "start" }}>
          {current?.[1].map((a) => (
            <button key={a.ens} className="col" style={{ alignItems: "center", background: "none", border: "1px dotted transparent", padding: 6, cursor: "pointer", gap: 4, textAlign: "center" }} onDoubleClick={() => openApp(a)} title={a.description}>
              <Icon name={a.icon} size={40} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{a.title}</span>
              <span className="muted" style={{ fontSize: 10, wordBreak: "break-all" }}>{a.ens}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="statusbar"><div>Double-click to open — you get your role&apos;s view</div><div>{index.length} published agents</div></div>
    </div>
  );
}

/* ── Folder = workspace ── */

export function FolderView({ folderId }: { folderId: string }) {
  const items = useOS((s) => s.items);
  const user = useOS((s) => s.user);
  const folder = items.find((i) => i.id === folderId);
  const kids = items.filter((i) => i.parent === folderId);
  if (!folder || folder.kind !== "folder") return <div style={{ padding: 20 }}>Folder not found.</div>;
  const b = agentBalance(folder.ens);
  return (
    <div className="col grow" style={{ minHeight: 0 }}>
      <div className="row" style={{ padding: 4, gap: 6 }}>
        <span>Address</span>
        <div className="field grow row" style={{ gap: 4 }}><Icon name="folder" size={16} /> {folder.ens}</div>
      </div>
      <div className="row grow" style={{ alignItems: "stretch", gap: 4, padding: 4, minHeight: 0 }}>
        <aside className="sunken scroll" style={{ width: 200, flex: "none", padding: 10, background: "linear-gradient(#f4f6fb, #dfe6f7)" }}>
          <Icon name="folder" size={40} />
          <div style={{ fontWeight: 800, fontSize: 15, wordBreak: "break-all" }}>{folder.ens}</div>
          <hr style={{ border: 0, borderTop: "2px solid var(--select)" }} />
          <b>Treasury</b>
          <div>{usd(b.usdc)} USDC</div>
          <b style={{ display: "block", marginTop: 8 }}>Spend policy</b>
          <div style={{ fontSize: 12 }}>Per agent: {b.cap} USDC/day</div>
          <div style={{ fontSize: 12 }}>Allowed: DeepBook, Cetus, pay</div>
          <b style={{ display: "block", marginTop: 8 }}>Roles (ENSv2 EAC)</b>
          <div style={{ fontSize: 12 }}>👑 {user} — owner</div>
          <div style={{ fontSize: 12 }}>👤 kenji.eth — member</div>
          <div style={{ fontSize: 12 }}>👁 yui.eth — viewer</div>
        </aside>
        <div className="sunken grow scroll" style={{ background: "#fff", padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, alignContent: "start" }}>
          {kids.length === 0 && <span className="muted">Empty. Drag apps from the desktop onto this folder&apos;s icon.</span>}
          {kids.map((k) =>
            k.kind === "app" ? (
              <button key={k.id} className="col" style={{ alignItems: "center", background: "none", border: "1px dotted transparent", padding: 6, cursor: "pointer", gap: 4, textAlign: "center" }} onDoubleClick={() => openApp(k.app)} onContextMenu={(e) => (e.preventDefault(), moveIntoFolder(k.id, null))} title="Right-click: move back to Desktop">
                <Icon name={k.app.icon} size={40} />
                <span style={{ fontSize: 12, fontWeight: 700 }}>{k.app.title}</span>
                <span className="muted" style={{ fontSize: 10, wordBreak: "break-all" }}>{k.app.ens}</span>
              </button>
            ) : k.kind === "folder" ? (
              <button key={k.id} className="col" style={{ alignItems: "center", background: "none", border: 0, cursor: "pointer" }} onDoubleClick={() => openFolder(k.id)}>
                <Icon name="folder" size={40} />
                <span>{k.name}</span>
              </button>
            ) : null,
          )}
        </div>
      </div>
      <div className="statusbar"><div>{kids.length} object(s)</div><div>Right-click an app to move it back to the Desktop</div></div>
    </div>
  );
}

export function RecycleBin() {
  const trash = useOS((s) => s.trash);
  return (
    <div className="col grow" style={{ padding: 4, gap: 4, minHeight: 0 }}>
      <ListView
        table={{
          columns: [{ key: "name", label: "Name" }, { key: "kind", label: "Type" }, { key: "note", label: "On-chain" }],
          rows: trash.map((t) => ({ name: t.kind === "app" ? t.app.ens : t.kind === "folder" ? t.ens : t.id, kind: t.kind, note: "Subname revoked · AgentCap burned" })),
        }}
      />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" disabled={!trash.length} onClick={emptyTrash}>Empty Recycle Bin</button>
      </div>
    </div>
  );
}

/* ── UI Kit showcase (the design system this OS is built from) ── */

export function UIKit() {
  const [tab, setTab] = useState(0);
  const [vol, setVol] = useState(60);
  return (
    <div className="col grow scroll" style={{ padding: 8, gap: 8 }}>
      <div className="tabs">
        {["Components", "Dialogs", "Icons"].map((t, i) => (
          <button key={t} className={`tab ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      <div className="tab-panel">
        {tab === 0 && (
          <div className="col" style={{ gap: 12 }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn">Default</button>
              <button className="btn primary">Primary</button>
              <button className="btn danger">Danger</button>
              <button className="btn success">Success</button>
              <button className="btn hover-demo">Hover</button>
              <button className="btn pressed">Pressed</button>
              <button className="btn" disabled>Disabled</button>
              <button className="btn"><Icon name="folder" size={18} />With Icon</button>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
              <label className="row">Text Input <input className="field" /></label>
              <label className="row">Dropdown <select className="field"><option>Windows 99</option></select></label>
              <label className="check"><input type="checkbox" defaultChecked /> Checkbox</label>
              <label className="radio"><input type="radio" name="r" defaultChecked /> Radio</label>
              <input type="range" className="slider" value={vol} onChange={(e) => setVol(+e.target.value)} style={{ ["--pct" as string]: `${vol}%` }} />
            </div>
            <div className="row"><span style={{ width: 70 }}>Volume</span><Progress value={vol / 100} width={300} /> {vol}%</div>
            <div className="row" style={{ gap: 4 }}>
              {["gray1", "gray2", "gray3", "navy", "purple", "teal", "cornflower", "yellow", "red", "green"].map((c) => (
                <div key={c} className="sunken" style={{ width: 28, height: 28, background: `var(--pal-${c})` }} title={c} />
              ))}
            </div>
          </div>
        )}
        {tab === 1 && (
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <button className="btn" onClick={() => message("Question", "question", "Do you want to continue?")}>Question</button>
            <button className="btn" onClick={() => message("Warning", "warning", "This action cannot be undone.")}>Warning</button>
            <button className="btn" onClick={() => message("Information", "info", "Operation completed successfully.")}>Information</button>
            <button className="btn" onClick={() => message("Error", "error", "An unexpected error has occurred.")}>Error</button>
            <button className="btn danger" onClick={() => bsod("kit.demo.eth", "DEMO_BLUE_SCREEN")}>Blue Screen</button>
          </div>
        )}
        {tab === 2 && <IconGrid />}
      </div>
    </div>
  );
}

function IconGrid() {
  const names = ["computer", "network", "recycle", "folder", "document", "notepad", "excel", "paint", "mine", "weather", "chart", "coin", "people", "clock", "shop", "piggy", "lock", "ticket", "globe", "search", "run", "settings", "task", "agent", "warning", "error", "info", "question", "shutdown", "rocket", "pool", "flame", "bomb", "mail", "calc", "cards", "music", "help", "drive", "logo"] as const;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
      {names.map((n) => (
        <div key={n} className="col" style={{ alignItems: "center", gap: 4 }}>
          <Icon name={n} size={36} />
          <span style={{ fontSize: 11 }}>{n}</span>
        </div>
      ))}
    </div>
  );
}
