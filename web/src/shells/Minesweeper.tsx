"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/win99/Widgets";
import { toGrid } from "@/lib/compose/adapt";
import { balloon, message, propose, recordActivity } from "@/os/store";
import type { ShellProps } from "./AppFrame";

type CellState = "hidden" | "open" | "flag" | "boom" | "position";

function Face({ mood }: { mood: string }) {
  const mouth = mood === "dead" ? "M9 20q7-5 14 0" : mood === "cool" ? "M9 18q7 6 14 0" : "M10 18q6 5 12 0";
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="#f7d417" stroke="#1b1b1b" strokeWidth="2" />
      {mood === "dead" ? (
        <path d="M9 10l5 5M14 10l-5 5M18 10l5 5M23 10l-5 5" stroke="#1b1b1b" strokeWidth="2" />
      ) : mood === "cool" ? (
        <path d="M7 12h18v2l-3 3h-4l-2-3-2 3h-4l-3-3z" fill="#1b1b1b" />
      ) : (
        <>
          <circle cx="12" cy="13" r="2" fill="#1b1b1b" />
          <circle cx="20" cy="13" r="2" fill="#1b1b1b" />
        </>
      )}
      <path d={mouth} fill="none" stroke="#1b1b1b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const NUM_COLORS = ["", "#1f47b8", "#127a2a", "#c21d17", "#13389e", "#7a1d00", "#128a8a", "#111", "#777"];

function LED({ value }: { value: number | string }) {
  return (
    <div className="sunken mono" style={{ background: "#000", color: "#ff2a1a", fontSize: 22, fontWeight: 700, padding: "0 6px", minWidth: 58, textAlign: "right", letterSpacing: 2, lineHeight: "30px" }}>
      {String(value).padStart(3, "0")}
    </div>
  );
}

/**
 * Minesweeper × leverage futures.
 * Row = leverage, column = entry offset from mark. Mines = liquidation. Numbers = liquidations nearby.
 * Flag = stop-loss. Opening a revealed tile proposes a (paper) perp position through the Signing dialog.
 */
export function MinesweeperShell({ app, bundle, preview }: ShellProps) {
  // Native perp grid, or a minefield adapted from any function's numbers ("minesweeper but LP").
  const g = toGrid(bundle);
  const cols = g.offsets.length;
  const [state, setState] = useState<CellState[][]>(() => g.cells.map((r) => r.map(() => "hidden")));
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [face, setFace] = useState("ok");
  const [time, setTime] = useState(0);
  const [dead, setDead] = useState(false);
  const board = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preview || dead) return;
    const id = setInterval(() => setTime((t) => Math.min(999, t + 1)), 1000);
    return () => clearInterval(id);
  }, [preview, dead]);

  const mines = g.cells.flat().filter((c) => c.mine).length;
  const flags = state.flat().filter((s) => s === "flag").length;

  const around = (r: number, c: number) => {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && g.cells[r + dr]?.[c + dc]?.mine) n++;
    return n;
  };

  const reset = () => {
    setState(g.cells.map((r) => r.map(() => "hidden")));
    setDead(false);
    setFace("ok");
    setTime(0);
    setSel(null);
  };

  const reveal = (r: number, c: number) => {
    if (preview || dead || state[r][c] !== "hidden") return;
    const cell = g.cells[r][c];
    if (cell.mine) {
      setState((s) => s.map((row, i) => row.map((v, j) => (g.cells[i][j].mine ? (i === r && j === c ? "boom" : "open") : v))));
      setDead(true);
      setFace("dead");
      if (board.current) gsap.fromTo(board.current, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.25)" });
      recordActivity({ agent: app.ens, kind: `LIQUIDATED ${cell.label}`, amount: app.params.amount?.value ?? 50, token: "USDC", status: "blocked" });
      message("Position Liquidated", "bomb", `💥 ${cell.label}\nThe mark wicked through your liquidation price.`, "Paper mode — no real funds lost. This time.");
      return;
    }
    // Flood-open zero tiles like the real game.
    setState((s) => {
      const next = s.map((row) => [...row]);
      const stack = [[r, c]];
      while (stack.length) {
        const [i, j] = stack.pop()!;
        if (next[i]?.[j] !== "hidden") continue;
        next[i][j] = "open";
        if (around(i, j) === 0) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (g.cells[i + di]?.[j + dj] && !g.cells[i + di][j + dj].mine) stack.push([i + di, j + dj]);
      }
      return next;
    });
    setSel({ r, c });
  };

  const flag = (r: number, c: number) => {
    if (preview || dead) return;
    setState((s) => s.map((row, i) => row.map((v, j) => (i === r && j === c ? (v === "flag" ? "hidden" : v === "hidden" ? "flag" : v) : v))));
    if (state[r][c] === "hidden") balloon("Stop-loss set", `${g.cells[r][c].label} — flagged`);
  };

  const openPosition = async () => {
    if (!sel) return;
    const cell = g.cells[sel.r][sel.c];
    const size = app.params.amount?.value ?? 50;
    const ok = await propose({
      kind: "Open perp (paper)",
      summary: `${cell.label}, size ${size} USDC`,
      agent: app.ens,
      to: "Bluefin Perps (paper)",
      amount: size,
      token: "USDC",
      network: "Sui Testnet",
      calls: [`bluefin::perpetual::open_position(${g.asset}, ${g.leverage[sel.r]}x)`],
      risk: Math.min(2, cell.risk * 2.4),
      notes: [`Liquidation risk ${(cell.risk * 100).toFixed(0)}%`, "Paper mode"],
    });
    if (ok) {
      setState((s) => s.map((row, i) => row.map((v, j) => (i === sel.r && j === sel.c ? "position" : v))));
      setFace("cool");
    }
  };

  const cellPx = preview ? 24 : 34;

  return (
    <div className="col grow" style={{ alignItems: "center", gap: 6, minHeight: 0, overflow: "auto" }}>
      <div className="raised" style={{ padding: 8 }}>
        <div className="sunken row" style={{ justifyContent: "space-between", padding: 5, background: "var(--face)", marginBottom: 8 }}>
          <LED value={Math.max(0, mines - flags)} />
          <button className="btn" style={{ minWidth: 36, width: 36, height: 34, fontSize: 20, padding: 0 }} onClick={reset} aria-label="Reset"><Face mood={face} /></button>
          <LED value={time} />
        </div>
        <div ref={board} className="sunken" style={{ display: "grid", gridTemplateColumns: `44px repeat(${cols}, ${cellPx}px)`, background: "#bdbab5", padding: 2 }}>
          <div />
          {g.offsets.map((o) => (
            <div key={o} style={{ fontSize: 10, textAlign: "center", fontWeight: 700, color: o > 0 ? "#127a2a" : "#c21d17" }}>{o > 0 ? `L+${o}%` : `S${o}%`}</div>
          ))}
          {g.leverage.map((lev, r) => (
            <Row key={lev} lev={lev}>
              {g.offsets.map((_, c) => {
                const s = state[r][c];
                const n = around(r, c);
                const isSel = sel?.r === r && sel?.c === c;
                const hidden = s === "hidden" || s === "flag";
                return (
                  <button
                    key={c}
                    title={g.cells[r][c].label}
                    onClick={() => (s === "open" ? setSel({ r, c }) : reveal(r, c))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      flag(r, c);
                    }}
                    style={{
                      width: cellPx,
                      height: cellPx,
                      padding: 0,
                      fontWeight: 900,
                      fontSize: preview ? 12 : 16,
                      cursor: "pointer",
                      border: hidden ? "2px outset #f3f1ed" : "1px solid #86837e",
                      background: s === "boom" ? "#df2e28" : s === "position" ? "#9ff0b3" : isSel ? "#c7d3f3" : hidden ? "var(--face)" : "#d9d6d1",
                      color: NUM_COLORS[n],
                    }}
                  >
                    {s === "flag" ? "🚩" : s === "boom" || (s === "open" && g.cells[r][c].mine) ? "💣" : s === "position" ? "📈" : s === "open" && n ? n : ""}
                  </button>
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      {!preview && (
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "center" }}>
          <span className="muted">{sel ? g.cells[sel.r][sel.c].label : "Click a tile to scout. Right-click = stop-loss."}</span>
          <button className="btn primary" disabled={!sel || dead || state[sel.r][sel.c] !== "open"} onClick={openPosition}>Open position</button>
          <span className="row" style={{ gap: 4 }}>
            <b style={{ fontSize: 11 }}>{bundle.gauge?.label}</b>
            <Progress value={bundle.gauge?.value ?? 0} width={120} />
          </span>
        </div>
      )}
    </div>
  );
}

function Row({ lev, children }: { lev: number; children: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", color: lev >= 20 ? "#c21d17" : "#111" }}>{lev}x</div>
      {children}
    </>
  );
}
