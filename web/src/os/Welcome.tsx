"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/win99/Icon";
import { toggleStart, useOS } from "./store";
import { closeWelcome, openWelcome, setShowAtStartup, setStartQuery, shouldShowAtStartup, useWelcomeOpen } from "./welcomeStore";

/**
 * "Welcome to Suica OS": the Windows 98 welcome screen, used as the project's landing page.
 * Topics on the left, one idea per page on the right, and "Try it" buttons that open Start with
 * a prompt already typed.
 */

type Topic = { id: string; label: string; icon: IconName };
const TOPICS: Topic[] = [
  { id: "what", label: "What is this?", icon: "logo" },
  { id: "try", label: "Type anything", icon: "search" },
  { id: "names", label: "Names are files", icon: "folder" },
  { id: "money", label: "Agents & money", icon: "coin" },
  { id: "how", label: "How it works", icon: "settings" },
];

const TRY: { q: string; what: string }[] = [
  { q: "excel of vitalik.eth portfolio", what: "a spreadsheet of a real wallet" },
  { q: "paint but roast vitalik.eth", what: "MS Paint roasts real holdings" },
  { q: "doom but I'm shooting my losses", what: "your losing bags are the demons" },
  { q: "paint app with eth chart on it", what: "a hand-drawn live ETH chart" },
  { q: "tetris but my portfolio", what: "a game that doesn't exist yet: watch it install" },
  { q: "split bills with 4 friends", what: "a shared tab that settles on Sui" },
  { q: "compare vitalik.eth and nick.eth", what: "two real wallets side by side" },
  { q: "gas tracker", what: "live Ethereum vs Sui gas" },
];

export function Welcome() {
  const user = useOS((s) => s.user);
  const isOpen = useWelcomeOpen();
  const [page, setPage] = useState(0);
  // Unticked by default: a new visitor sees this once; demo reloads don't keep re-opening it.
  const [showAgain, setShowAgain] = useState(false);

  // After boot: the first thing a new visitor sees.
  useEffect(() => {
    if (!user || !shouldShowAtStartup()) return;
    const t = setTimeout(() => openWelcome(), 600);
    return () => clearTimeout(t);
  }, [user]);

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
    <div role="dialog" aria-modal="true" aria-label="Welcome to Suica OS" style={{ position: "fixed", inset: 0, zIndex: 9500, display: "grid", placeItems: "center", background: "rgba(0,0,40,0.35)" }}>
      <div className="window active" style={{ position: "relative", width: "min(760px, calc(100vw - 32px))", height: "min(520px, calc(100vh - 80px))", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="titlebar">
          <Icon name="logo" size={18} />
          <span className="title">Welcome to Suica OS</span>
          <button type="button" className="tb-btn close" aria-label="Close" onClick={close}>✕</button>
        </div>

        <div className="row grow" style={{ minHeight: 0, gap: 0, alignItems: "stretch" }}>
          {/* Topic list, like Windows 98's welcome screen. */}
          <div className="col" style={{ width: 190, flex: "none", background: "linear-gradient(#0a2a8a, #1c3fa6)", color: "#fff", padding: "14px 8px", gap: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 800, padding: "0 6px 12px", letterSpacing: -0.5 }}>
              Suica<span style={{ color: "#7de3c4" }}>OS</span>
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
            Show this each time Suica OS starts
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
            <b>This is a fully hallucinated operating system.</b> Nothing on this screen was built as an app. Every window is composed in real time by <b>Jev</b>, a model that decides what you meant in about a tenth of a second.
          </P>
          <P>
            We&apos;re moving towards a future where we don&apos;t need apps for anything. Agents do the work. But we still need user interfaces: to see what our agents did, to understand it, and to say yes or no.
          </P>
          <P>
            So we think interfaces will be generated on demand: changing in real time, and personal to whoever is using them. No frontend to build, no app to install. <b>Suica OS is an experiment in that idea.</b>
          </P>
          <div className="sunken" style={{ padding: 10, background: "#ffffe1", fontSize: 13 }}>
            <b>Imagine a search bar where anything you type becomes an app.</b> What would you make?
          </div>
        </>
      );
    case "try":
      return (
        <>
          <P>
            Open <b>Start</b> (or press <span className="mono">Ctrl+Esc</span>) and type. A familiar program (Excel, Paint, Minesweeper, Doom…) is combined with a crypto capability and a target, and the app appears as you type. Pick one to try:
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
            The numbers are real: wallets, prices and gas come from Ethereum mainnet and Sui. Ask for a program that doesn&apos;t exist yet (&quot;tetris but…&quot;) and Setup writes it for you in the background, while the app keeps working.
          </P>
        </>
      );
    case "names":
      return (
        <>
          <P>
            <b>ENS is the file system.</b> Every app and folder is a real ENSv2 name on Sepolia, under <span className="mono">suica.eth</span>:
          </P>
          <pre className="sunken mono" style={{ margin: 0, padding: 10, fontSize: 12, background: "#f4f6fb" }}>{`suica.eth
├── grouptab.suica.eth        app (manifest in its records)
├── shibuya-cafe.suica.eth    folder = its own registry
│   └── checkout.shibuya-…    app inside the folder
├── users.suica.eth           one username per person
└── shells.suica.eth          generated programs, shared`}</pre>
          <P>
            <b>Sharing is access control.</b> Share a folder and you grant ENSv2 roles on its registry: members can create apps in it, managers can also share it.
          </P>
          <P>
            <b>Moving is a symlink.</b> Drag an app into a folder and it gets a new name there. Its old name becomes an ENSv2 <i>alias</i> of the new one, so old share links keep working.
          </P>
          <P>Apps are places, not programs: making one is instant, and its name is where everyone meets.</P>
        </>
      );
    case "money":
      return (
        <>
          <P>
            <b>Log on with Google</b> and you get a real Sui wallet (zkLogin): no seed phrase, and gas is sponsored, so you never need SUI to use it.
          </P>
          <P>
            <b>Apps only propose; you approve.</b> Every transaction goes through one fixed signing dialog that is never generated. It shows what will happen, simulated on Sui first.
          </P>
          <P>
            <b>Tappy</b>, the assistant in the corner, is the agent. It stays quiet until something needs you. Within a limit you set (&quot;up to ¥5,000 a day&quot;) it acts on its own, then tells you. Over the limit it asks. If an agent tries to overspend anyway, the Move contract rejects it on-chain and you get a blue screen. No funds move.
          </P>
          <P>
            <span className="muted">Continue as a guest to explore in paper mode: nothing real moves.</span>
          </P>
        </>
      );
    default:
      return (
        <>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 13 }}>
            <li>
              <b>You type.</b> On every keystroke, <b>Jev</b> answers about 20 typed questions in one call: which program, which capability, what vibe, is it risky? It never writes text or UI. <b>Code does the rest</b>: amounts, names and tokens are parsed, never guessed.
            </li>
            <li>
              <b>The app is composed</b> from program × capability × target, e.g. Paint × Roast × vitalik.eth. That takes about 1 KB of decisions, stored in the app&apos;s ENS name so anyone can reopen it.
            </li>
            <li>
              <b>Real data</b> streams in: mainnet ENS + token prices, Sui balances, live gas.
            </li>
            <li>
              <b>New programs</b> are written once by an LLM in the background. They run sandboxed with no network access, are tested, stored on Walrus and named under <span className="mono">shells.suica.eth</span>, and are instant for everyone after that.
            </li>
            <li>
              <b>Money</b> moves on Sui through the fixed signing dialog, capped on-chain by each app&apos;s AgentVault.
            </li>
          </ol>
          <P>
            <span className="muted">Built at ETHGlobal Tokyo 2026 · Sui · ENSv2 · Curvegrid · Jev by TypeSafe AI.</span>
          </P>
        </>
      );
  }
}
