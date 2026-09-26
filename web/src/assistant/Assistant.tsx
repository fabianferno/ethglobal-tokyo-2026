"use client";

import { useEffect, useState } from "react";
import { toggleStart, openSystem, useOS } from "@/os/store";
import { openWelcome } from "@/os/welcomeStore";
import { greet, onBsodChanged, onWindowsChanged, watchInstalls } from "./brain";
import { type Bubble, dismiss, hydrateAssistant, type Mood, say, setHidden, useAssistant } from "./store";

/**
 * Tappy: the OS-wide assistant, docked bottom-right. An original character (a transit IC card with
 * eyes), in the spirit of the Office Assistant: it fidgets while idle, speaks only in balloons with
 * buttons, and every action it proposes still goes through the fixed Signing dialog or the cap.
 */
export function Assistant() {
  const user = useOS((s) => s.user);
  const windows = useOS((s) => s.windows);
  const bsod = useOS((s) => s.bsod);
  const bubble = useAssistant((s) => s.bubble);
  const mood = useAssistant((s) => s.mood);
  const hidden = useAssistant((s) => s.hidden);

  useEffect(() => {
    hydrateAssistant();
    return watchInstalls();
  }, []);
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => greet(user), 1200);
    return () => clearTimeout(t);
  }, [user]);
  useEffect(() => onWindowsChanged(), [windows]);
  useEffect(() => onBsodChanged(), [bsod]);

  if (hidden) {
    return (
      <button type="button" className="btn sm tappy-recall" title="Show Tappy" onClick={() => setHidden(false)}>
        <Card mood="idle" size={22} />
      </button>
    );
  }
  return (
    <div className="tappy" aria-live="polite">
      <style>{CSS}</style>
      {bubble && <Balloon key={bubble.id} bubble={bubble} />}
      <button type="button" className="tappy-body" title="Tappy — click for help" onClick={() => (bubble ? undefined : menu())}>
        <Card mood={mood} size={84} />
      </button>
    </div>
  );
}

function menu() {
  say({
    id: "menu",
    title: "What would you like to do?",
    text: "",
    choices: [
      { id: "start", label: "Make an app" },
      { id: "task", label: "See what my agents are doing" },
      { id: "welcome", label: "What is Suica OS?" },
      { id: "hide", label: "Hide Tappy" },
    ],
    defaultChoice: "start",
    buttons: [
      {
        label: "OK",
        primary: true,
        onClick: (c) =>
          c === "task"
            ? openSystem("taskmgr")
            : c === "welcome"
              ? openWelcome()
              : c === "hide"
                ? setHidden(true)
                : toggleStart(true),
      },
      { label: "Cancel" },
    ],
  });
}

function Balloon({ bubble }: { bubble: Bubble }) {
  const [choice, setChoice] = useState<string | null>(bubble.defaultChoice ?? bubble.choices?.[0]?.id ?? null);
  return (
    <div className="tappy-balloon" role="dialog" aria-label={bubble.title ?? "Tappy"}>
      {bubble.title && <b style={{ display: "block", marginBottom: 4 }}>{bubble.title}</b>}
      {bubble.text && <div style={{ whiteSpace: "pre-wrap" }}>{bubble.text}</div>}
      {bubble.choices && (
        <div className="col" style={{ gap: 3, marginTop: 6 }}>
          {bubble.choices.map((c) => (
            <label key={c.id} className="row" style={{ gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" name={bubble.id} checked={choice === c.id} onChange={() => setChoice(c.id)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6, justifyContent: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        {bubble.buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            className={`btn sm ${b.primary ? "primary" : ""}`}
            onClick={() => {
              dismiss();
              b.onClick?.(choice);
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The character: a bent-wire paperclip with big eyes and heavy brows, sitting on a sheet of paper.
 *  Pure SVG + CSS, so it animates without assets. */
const CLIP_WIRE = "M36 60V30a6 6 0 0 1 12 0V70a10 10 0 0 1-20 0V20a14 14 0 0 1 28 0V62";

function Card({ mood, size }: { mood: Mood; size: number }) {
  const guilty = mood === "guilty";
  const happy = mood === "happy" || mood === "wave";
  const think = mood === "think";
  const brows = guilty
    ? "M25 22l11-4M59 22l-11-4"
    : happy
      ? "M25 17q7-6 13-1M46 16q6-5 13 1"
      : think
        ? "M25 21q7-3 13 0M46 15q6-4 13 2"
        : "M25 20q7-4 13 0M46 20q6-4 13 0";
  const px = guilty ? -2 : think ? 2 : 1;
  const py = guilty ? 3 : think ? -3 : 1;
  return (
    <svg className={`tappy-card mood-${mood}`} width={size} height={size * 1.1} viewBox="0 0 80 88" aria-hidden="true">
      <defs>
        <linearGradient id="tappy-wire" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d949c" />
          <stop offset=".45" stopColor="#eef1f4" />
          <stop offset="1" stopColor="#a7aeb6" />
        </linearGradient>
      </defs>
      {/* the sheet of paper he sits on */}
      <path d="M10 79l52-5 8 10-54 3z" fill="#fffbe0" stroke="#123" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M18 81l40-4M20 84l42-4" stroke="#b9c7e0" strokeWidth="1" />
      <g className="tappy-float">
        {/* wire: dark outline, metal body, highlight */}
        <path d={CLIP_WIRE} stroke="#2b3036" strokeWidth="6.5" fill="none" strokeLinecap="round" />
        <path d={CLIP_WIRE} stroke="url(#tappy-wire)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d={CLIP_WIRE} stroke="#fff" strokeOpacity=".55" strokeWidth="1" fill="none" strokeLinecap="round" transform="translate(-.8 -.4)" />
        {/* brows */}
        <path d={brows} stroke="#123" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* eyes */}
        <g className="tappy-eyes">
          <ellipse cx="33" cy="31" rx="7" ry="8.5" fill="#fff" stroke="#123" strokeWidth="1.8" />
          <ellipse cx="51" cy="31" rx="7" ry="8.5" fill="#fff" stroke="#123" strokeWidth="1.8" />
          <circle className="tappy-pupil" cx={33 + px} cy={31 + py} r="3.4" fill="#123" />
          <circle className="tappy-pupil" cx={51 + px} cy={31 + py} r="3.4" fill="#123" />
          <circle cx={34.2 + px} cy={29.8 + py} r="1" fill="#fff" />
          <circle cx={52.2 + px} cy={29.8 + py} r="1" fill="#fff" />
        </g>
        {guilty && <path d="M64 14q3 5 0 8q-3-3 0-8z" fill="#8fd3ff" stroke="#123" strokeWidth="1" className="tappy-sweat" />}
        {mood === "wave" && (
          <path d="M56 46q10-2 13-14" stroke="#2b3036" strokeWidth="4" fill="none" strokeLinecap="round" className="tappy-arm" />
        )}
      </g>
    </svg>
  );
}

const CSS = `
.tappy{position:fixed;right:14px;bottom:44px;z-index:9000;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none}
.tappy>*{pointer-events:auto}
.tappy-body{background:none;border:0;padding:0;cursor:pointer;filter:drop-shadow(2px 3px 0 rgba(0,0,0,.35))}
.tappy-balloon{position:relative;max-width:300px;background:#ffffe1;border:1px solid #1b1b1b;border-radius:8px;padding:10px 12px;font-size:12px;box-shadow:2px 2px 0 rgba(0,0,0,.35);margin-right:28px}
.tappy-balloon:after{content:"";position:absolute;right:26px;bottom:-11px;border:6px solid transparent;border-top:6px solid #1b1b1b;border-width:11px 7px 0 7px}
.tappy-balloon:before{content:"";position:absolute;right:27px;bottom:-9px;border-style:solid;border-color:#ffffe1 transparent transparent;border-width:10px 6px 0 6px;z-index:1}
.tappy-recall{position:fixed;right:14px;bottom:44px;z-index:9000;padding:2px 4px}
.tappy-float{animation:tappy-bob 3.2s ease-in-out infinite;transform-origin:42px 80px}
.mood-think .tappy-float{animation:tappy-tilt 1.6s ease-in-out infinite}
.mood-happy .tappy-float,.mood-wave .tappy-float{animation:tappy-hop .9s ease-in-out 3}
.mood-guilty .tappy-float{animation:tappy-shrink 2.4s ease-in-out infinite}
.tappy-eyes{animation:tappy-blink 5s infinite;transform-origin:42px 31px}
.tappy-arm{animation:tappy-wave .5s ease-in-out infinite alternate;transform-origin:56px 46px}
.tappy-sweat{animation:tappy-drip 1.4s ease-in infinite}
@keyframes tappy-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes tappy-tilt{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes tappy-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}
@keyframes tappy-shrink{0%,100%{transform:scale(.96) translateY(2px)}50%{transform:scale(.93) translateY(3px)}}
@keyframes tappy-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes tappy-wave{from{transform:rotate(-12deg)}to{transform:rotate(14deg)}}
@keyframes tappy-drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(8px);opacity:0}}
@media (prefers-reduced-motion: reduce){.tappy *{animation:none!important}}
`;
