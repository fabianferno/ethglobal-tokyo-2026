"use client";

import { useEffect, useState } from "react";
import { dismissInstall, type Install, useGenShells } from "@/lib/genshell/client";

/**
 * "Setup is installing TETRIS.EXE…" — the classic copy-files dialog, docked by the tray so it never
 * blocks the app you're using. Progress is honest about stages; within a stage it eases toward the
 * stage's ceiling (generation takes 30–120 s and gives no byte-level progress).
 */

const STAGES: Record<Install["stage"], { text: string; from: number; to: number; expectMs: number }> = {
  generating: { text: "Writing program files…", from: 0.03, to: 0.72, expectMs: 90_000 },
  retrying: { text: "Fixing a problem and trying again…", from: 0.3, to: 0.8, expectMs: 90_000 },
  testing: { text: "Testing in the sandbox…", from: 0.75, to: 0.88, expectMs: 8_000 },
  publishing: { text: "Registering with Walrus + ENS…", from: 0.9, to: 0.98, expectMs: 4_000 },
  done: { text: "Setup complete.", from: 1, to: 1, expectMs: 1 },
  failed: { text: "Setup failed.", from: 0, to: 0, expectMs: 1 },
};

export function InstallTray() {
  const installs = useGenShells((s) => s.installs);
  const active = Object.values(installs).filter((i) => i.stage !== "done");
  if (!active.length) return null;
  return (
    <div style={{ position: "fixed", right: 440, bottom: 48, zIndex: 8500, display: "flex", flexDirection: "column", gap: 6 }}>
      <style>{CSS}</style>
      {active.map((i) => (
        <Setup key={i.label} install={i} />
      ))}
    </div>
  );
}

function Setup({ install }: { install: Install }) {
  const [now, setNow] = useState(() => Date.now());
  const stageAt = install.stageAt ?? install.startedAt;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = STAGES[install.stage];
  const t = Math.min(1, (now - stageAt) / s.expectMs);
  const p = s.from + (s.to - s.from) * (1 - Math.pow(1 - t, 2));
  const failed = install.stage === "failed";
  const secs = Math.round((now - install.startedAt) / 1000);

  return (
    <div className="window active" style={{ position: "relative", width: 320, minHeight: 0 }}>
      <div className="titlebar">
        <span className="title">Setup — {install.exe}</span>
        {failed && (
          <button type="button" className="tb-btn" aria-label="Close" onClick={() => dismissInstall(install.label)}>
            ✕
          </button>
        )}
      </div>
      <div className="col" style={{ padding: 10, gap: 8 }}>
        {!failed && (
          <div className="setup-fly" aria-hidden="true">
            <span className="setup-folder">📁</span>
            <span className="setup-doc">📄</span>
            <span className="setup-folder">📂</span>
          </div>
        )}
        <div style={{ fontSize: 12 }}>{failed ? `Setup was unable to install ${install.exe}.` : `Setup is installing ${install.exe}…`}</div>
        <div className="muted" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{failed ? install.error : `${s.text} (${secs}s)`}</div>
        {!failed && (
          <div className="sunken" style={{ height: 16, padding: 2 }}>
            <div className="setup-bar" style={{ width: `${Math.round(p * 100)}%` }} />
          </div>
        )}
        <div className="muted" style={{ fontSize: 10 }}>Keep working. Your app runs in {install.fallback ?? "Explorer"} compatibility mode until setup finishes.</div>
      </div>
    </div>
  );
}

const CSS = `
.setup-bar{height:100%;background:repeating-linear-gradient(90deg,var(--progress) 0 9px,transparent 9px 11px);transition:width .25s linear}
.setup-fly{position:relative;height:28px;display:flex;justify-content:space-between;align-items:center;padding:0 10px;font-size:20px}
.setup-doc{position:absolute;left:34px;top:2px;font-size:14px;animation:setup-fly 1.3s linear infinite}
@keyframes setup-fly{0%{transform:translate(0,4px) rotate(0)}50%{transform:translate(110px,-8px) rotate(160deg)}100%{transform:translate(220px,4px) rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.setup-doc{animation:none}}
`;
