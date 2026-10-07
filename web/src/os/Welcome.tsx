"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/win99/Icon";
import { toggleStart, useOS } from "./store";
import { closeWelcome, openWelcome, setShowAtStartup, setStartQuery, shouldShowAtStartup, useWelcomeOpen } from "./welcomeStore";

/**
 * "Welcome to Jev OS": the Windows 98 welcome screen, used as the project's landing page.
 * Topics on the left, one idea per page on the right, and "Try it" buttons that open Start with
 * a prompt already typed.
 */

type Topic = { id: string; label: string; icon: IconName };
const TOPICS: Topic[] = [
  { id: "what", label: "What is this?", icon: "logo" },
  { id: "try", label: "Type anything", icon: "search" },
  { id: "how", label: "How it works", icon: "settings" },
];

export const TRY: { q: string; what: string }[] = [
  { q: "minesweeper but about cats", what: "a game board Jev has never seen" },
  { q: "excel of the best ramen in tokyo", what: "a spreadsheet written on the spot" },
  { q: "paint but roast my monday", what: "MS Paint, but it has opinions" },
  { q: "weather forecast for my mood", what: "a forecast for something that isn't weather" },
  { q: "notepad diary of a pirate", what: "a document that writes itself" },
  { q: "tetris but about sushi", what: "a program that doesn't exist yet: watch it install" },
];

export function Welcome() {
  const booted = useOS((s) => s.booted);
  const isOpen = useWelcomeOpen();
  const [page, setPage] = useState(0);
  // Unticked by default: a new visitor sees this once; demo reloads don't keep re-opening it.
  const [showAgain, setShowAgain] = useState(false);

  // After boot: the first thing a new visitor sees.
  useEffect(() => {
    if (!booted || !shouldShowAtStartup()) return;
    const t = setTimeout(() => openWelcome(), 600);
    return () => clearTimeout(t);
  }, [booted]);

  if (!isOpen) return null;

  const close = () => {
    setShowAtStartup(showAgain);
    closeWelcome();
  };
  const tryIt = (q: string) => {
    close();
    setStartQuery(q);
    toggleStart(true);
  };
  const topic = TOPICS[page];

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Jev OS" style={{ position: "fixed", inset: 0, zIndex: 9500, display: "grid", placeItems: "center", background: "rgba(0,0,40,0.35)" }}>
      <div className="window active" style={{ position: "relative", width: "min(760px, calc(100vw - 32px))", height: "min(520px, calc(100vh - 80px))", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="titlebar">
          <Icon name="logo" size={18} />
          <span className="title">Welcome to Jev OS</span>
          <button type="button" className="tb-btn close" aria-label="Close" onClick={close}>✕</button>
        </div>

        <div className="row grow" style={{ minHeight: 0, gap: 0, alignItems: "stretch" }}>
          {/* Topic list, like Windows 98's welcome screen. */}
          <div className="col" style={{ width: 190, flex: "none", background: "linear-gradient(#0a2a8a, #1c3fa6)", color: "#fff", padding: "14px 8px", gap: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 800, padding: "0 6px 12px", letterSpacing: -0.5 }}>
              Jev<span style={{ color: "#7de3c4" }}>OS</span>
            </div>
            {TOPICS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPage(i)}
                className="row"
                style={{ gap: 8, alignItems: "center", padding: "6px 8px", border: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "#fff", background: i === page ? "rgba(255,255,255,0.22)" : "transparent", fontWeight: i === page ? 800 : 500, borderRadius: 2 }}
              >
                <Icon name={t.icon} size={20} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="col grow" style={{ minWidth: 0, padding: "16px 20px", gap: 10, overflow: "auto", background: "#fff" }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{topic.label}</h2>
            <Page id={topic.id} tryIt={tryIt} />
          </div>
        </div>

        <div className="row" style={{ padding: "8px 10px", gap: 8, alignItems: "center", borderTop: "1px solid var(--shadow)", boxShadow: "inset 0 1px 0 var(--hilite)" }}>
          <label className="row grow" style={{ gap: 6, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={showAgain} onChange={(e) => setShowAgain(e.target.checked)} />
            Show this each time Jev OS starts
          </label>
          <button type="button" className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>&lt; Back</button>
          {page < TOPICS.length - 1 ? (
            <button type="button" className="btn primary" onClick={() => setPage((p) => p + 1)}>Next &gt;</button>
          ) : (
            <button type="button" className="btn primary" onClick={() => tryIt("")}>Start exploring</button>
          )}
          <button type="button" className="btn" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, lineHeight: 1.5, fontSize: 13 }}>{children}</p>;
}

function Page({ id, tryIt }: { id: string; tryIt: (q: string) => void }) {
  switch (id) {
    case "what":
      return (
        <>
          <P>
            <b>Nothing on this desktop was built as an app.</b> Every window is composed while you type by <b>Jev</b>, a model that decides what you meant in under half a second.
          </P>
          <P>
            We think interfaces will be generated on demand: changing in real time, and personal to whoever is using them. No frontend to build, no app to install. <b>Jev OS is an experiment in that idea.</b>
          </P>
          <P>Nothing is saved, either. Close a window and the app is gone; type it again and it is made again.</P>
          <div className="sunken" style={{ padding: 10, background: "#ffffe1", fontSize: 13 }}>
            <b>Imagine a search bar where anything you type becomes an app.</b> What would you make?
          </div>
        </>
      );
    case "try":
      return (
        <>
          <P>
            Open <b>Start</b> (or press <span className="mono">Ctrl+Esc</span>) and type. A familiar program (Excel, Paint, Minesweeper, Notepad, Doom…) is combined with what you asked for, and the app takes shape as you type. Pick one to try:
          </P>
          <div className="col" style={{ gap: 5 }}>
            {TRY.map((t) => (
              <button key={t.q} type="button" className="menu-item" onClick={() => tryIt(t.q)} style={{ padding: "5px 8px", alignItems: "center", gap: 10, border: "1px solid #d6d3ce" }}>
                <Icon name="run" size={18} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <b className="mono" style={{ fontSize: 12 }}>{t.q}</b>
                  <span className="muted" style={{ fontSize: 11 }}> · {t.what}</span>
                </span>
              </button>
            ))}
          </div>
          <P>
            Ask for a program that doesn&apos;t exist yet (&quot;tetris but…&quot;) and Setup writes it for you in the background, while the app keeps working.
          </P>
        </>
      );
    default:
      return (
        <>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 13 }}>
            <li>
              <b>You type.</b> On every keystroke, <b>Jev</b> answers a handful of typed questions in parallel, in one call to the OpenAI Decisions API: which program, what shape of content, what tone, which animation. It never writes text or UI. <b>Code builds the window</b> from those answers.
            </li>
            <li>
              <b>You press Enter.</b> The window opens instantly in the right shape, and <b>Gemini</b> writes the content into it: the rows, the board, the poem, the roast.
            </li>
            <li>
              <b>New programs</b> are written once by an LLM in the background. They run sandboxed with no network access, are tested, and are instant for everyone after that.
            </li>
          </ol>
          <P>
            <span className="muted">Jev on the OpenAI Decisions API (gpt-6-luna) · content and pictures by Gemini.</span>
          </P>
        </>
      );
  }
}
