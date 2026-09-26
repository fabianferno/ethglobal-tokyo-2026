"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { Icon } from "@/components/win99/Icon";
import type { ShellProps } from "./AppFrame";

type Sky = "sun" | "partly" | "rain" | "storm";

function mood(v: number): { name: string; kind: Sky; sky: string } {
  if (v > 0.7) return { name: "Liquidation Storm", kind: "storm", sky: "linear-gradient(#2a2f45, #555c7a)" };
  if (v > 0.5) return { name: "Wicky Showers", kind: "rain", sky: "linear-gradient(#5d6e8f, #9aa9c4)" };
  if (v > 0.3) return { name: "Partly Choppy", kind: "partly", sky: "linear-gradient(#3f7fd9, #9cc3f5)" };
  return { name: "Calm & Sunny", kind: "sun", sky: "linear-gradient(#2f8ad8, #9fd3ff)" };
}

/** SVG weather glyphs (emoji fonts aren't everywhere). */
function SkyIcon({ kind, size }: { kind: Sky; size: number }) {
  const O = "#1b1b1b";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {(kind === "sun" || kind === "partly") && (
        <g>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="30" y="2" width="4" height="10" rx="2" fill="#f7a400" transform={`rotate(${i * 45} 32 32)`} />
          ))}
          <circle cx="32" cy="32" r="14" fill="#f7d417" stroke={O} strokeWidth="2" />
        </g>
      )}
      {kind !== "sun" && (
        <path d="M18 52a10 10 0 010-20 14 14 0 0126-4 10 10 0 012 24z" fill={kind === "partly" ? "#fff" : kind === "rain" ? "#cfd6e3" : "#6b7390"} stroke={O} strokeWidth="2" transform={kind === "partly" ? "translate(6 6)" : "translate(0 -6)"} />
      )}
      {kind === "rain" && [16, 28, 40].map((x) => <path key={x} d={`M${x} 50l-4 10`} stroke="#2f63d8" strokeWidth="3" strokeLinecap="round" />)}
      {kind === "storm" && <path d="M34 42l-10 12h8l-4 10 14-16h-8l6-6z" fill="#ffe74a" stroke={O} strokeWidth="1.5" />}
    </svg>
  );
}

/** Weather shell: Gauge shape → market mood as a forecast. */
export function WeatherShell({ bundle, preview }: ShellProps) {
  const g = bundle.gauge!;
  const m = mood(g.value);
  const big = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!big.current) return;
    const ctx = gsap.context(() => {
      if (g.value > 0.7) gsap.to(".w-big", { x: 4, duration: 0.07, yoyo: true, repeat: -1, repeatDelay: 1.5 });
      else gsap.to(".w-big", { rotation: g.value < 0.3 ? 360 : 8, duration: g.value < 0.3 ? 20 : 2, repeat: -1, yoyo: g.value >= 0.3, ease: g.value < 0.3 ? "none" : "sine.inOut" });
      gsap.from(".w-day", { y: 30, opacity: 0, stagger: 0.08, duration: 0.4, ease: "back.out(2)" });
    }, big);
    return () => ctx.revert();
  }, [g.value]);

  return (
    <div ref={big} className="col grow" style={{ gap: 6, minHeight: 0, overflow: "auto" }}>
      <div className="sunken row" style={{ background: m.sky, color: "#fff", padding: preview ? 10 : 18, gap: 20, flex: "none", textShadow: "1px 1px 0 #000" }}>
        <div className="w-big" style={{ lineHeight: 0 }}><SkyIcon kind={m.kind} size={preview ? 64 : 96} /></div>
        <div className="col" style={{ gap: 2 }}>
          <div style={{ fontSize: preview ? 30 : 46, fontWeight: 900 }}>{Math.round(g.value * 100)}°V</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{m.name}</div>
          <div>{g.caption}</div>
        </div>
      </div>
      {g.forecast && (
        <div className="row" style={{ gap: 6, flex: "none" }}>
          {g.forecast.map((d) => (
            <div key={d.day} className="raised w-day col" style={{ flex: 1, alignItems: "center", padding: 8, gap: 2 }}>
              <b>{d.day}</b>
              <SkyIcon kind={mood(d.value).kind} size={36} />
              <span>{Math.round(d.value * 100)}°V</span>
            </div>
          ))}
        </div>
      )}
      {bundle.list && !preview && (
        <div className="sunken scroll grow" style={{ padding: 4 }}>
          {bundle.list.items.map((it, i) => (
            <div key={i} className="row" style={{ padding: 5 }}>
              {it.icon && <Icon name={it.icon} size={22} />}
              <div>
                <b>{it.title}</b>
                <div className="muted" style={{ fontSize: 11 }}>{it.subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
