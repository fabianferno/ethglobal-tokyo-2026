"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { PRICES } from "@/lib/chain/mock";
import type { SceneKey } from "@/lib/intent/types";

/**
 * Hand-built GSAP scenes. Jev's `scene` answer picks one instantly — zero latency.
 * (An optional LLM-written timeline can cross-fade over this later; the app never waits for it.)
 */

const W = 800;

const BG: Record<Exclude<SceneKey, "none">, string> = {
  coins: "linear-gradient(#1c3fa6, #2f63d8)",
  ticker: "linear-gradient(#050a14, #0e1b33)",
  storm: "linear-gradient(#1a1d29, #3a3f55)",
  rocket: "linear-gradient(#0b1030, #27307a)",
  sakura: "linear-gradient(#ffe3ec, #ffd0de)",
  pool: "linear-gradient(#0f7c9c, #22c6c6)",
  fire: "linear-gradient(#2a0a00, #7a1d00)",
};

function r(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function SceneStrip({ kind, height = 54, label }: { kind: SceneKey; height?: number; label?: string }) {
  const root = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    if (kind === "none" || !root.current) return;
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root.current);
      if (kind === "coins") {
        q(".coin").forEach((el, i) => {
          gsap.fromTo(el, { y: -30, x: 40 + i * 70, rotation: 0 }, { y: height - 12, rotation: 360, duration: 1.2 + r(i) * 0.8, ease: "bounce.out", repeat: -1, delay: r(i + 3) * 2, repeatDelay: 0.6 });
        });
      }
      if (kind === "ticker") {
        gsap.fromTo(q(".tape"), { x: 0 }, { x: -W, duration: 14, ease: "none", repeat: -1 });
      }
      if (kind === "storm") {
        gsap.to(q(".bolt"), { opacity: 1, duration: 0.06, repeat: -1, yoyo: true, repeatDelay: 1.8, ease: "steps(1)", stagger: 0.7 });
        q(".drop").forEach((el, i) => gsap.fromTo(el, { y: -20 }, { y: height + 10, duration: 0.5 + r(i) * 0.4, ease: "none", repeat: -1, delay: r(i + 1) }));
        gsap.to(q(".cloud"), { x: 30, duration: 4, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: 0.5 });
      }
      if (kind === "rocket") {
        gsap.fromTo(q(".rocket"), { x: -60, y: height + 20 }, { x: W + 60, y: -40, duration: 3.2, ease: "power1.in", repeat: -1, repeatDelay: 0.4 });
        q(".star").forEach((el, i) => gsap.to(el, { opacity: 0.2, duration: 0.4 + r(i), yoyo: true, repeat: -1 }));
      }
      if (kind === "sakura") {
        q(".petal").forEach((el, i) =>
          gsap.fromTo(el, { x: r(i) * W, y: -10, rotation: 0 }, { x: `+=${60 + r(i + 2) * 80}`, y: height + 10, rotation: 240, duration: 3 + r(i + 5) * 3, ease: "sine.inOut", repeat: -1, delay: r(i + 7) * 3 }),
        );
      }
      if (kind === "pool") {
        gsap.fromTo(q(".wave"), { x: 0 }, { x: -200, duration: 4, ease: "none", repeat: -1, stagger: 0.6 });
        q(".bubble").forEach((el, i) => gsap.fromTo(el, { y: height, opacity: 0.8 }, { y: -10, opacity: 0, duration: 2 + r(i) * 2, repeat: -1, delay: r(i + 4) * 2, ease: "sine.in" }));
      }
      if (kind === "fire") {
        q(".flame").forEach((el, i) => gsap.to(el, { scaleY: 1.35, scaleX: 0.85, transformOrigin: "50% 100%", duration: 0.18 + r(i) * 0.2, yoyo: true, repeat: -1, ease: "sine.inOut" }));
      }
    }, root);
    return () => ctx.revert();
  }, [kind, height]);

  if (kind === "none") return null;
  const n = (k: number) => Array.from({ length: k }, (_, i) => i);

  return (
    <div className="sunken" style={{ height, flex: "none", overflow: "hidden", background: BG[kind], position: "relative", padding: 0 }}>
      <svg ref={root} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
        {kind === "coins" && (
          <>
            <path d={`M${W - 90} ${height - 30}h60l-6 30h-48z`} fill="rgba(255,255,255,.25)" stroke="#fff" />
            {n(10).map((i) => (
              <g key={i} className="coin">
                <ellipse rx="10" ry="10" fill="#f7d417" stroke="#8a6408" strokeWidth="2" />
                <text y="4" textAnchor="middle" fontSize="11" fontWeight="900" fill="#8a6408">$</text>
              </g>
            ))}
          </>
        )}
        {kind === "ticker" && (
          <g className="tape">
            {[0, W].map((off) => (
              <text key={off} x={off} y={height / 2 + 5} fontFamily="Lucida Console, monospace" fontSize="15" fontWeight="700">
                {Object.entries(PRICES).map(([t, p]) => (
                  <tspan key={t} fill={p.change24h >= 0 ? "#3aff6a" : "#ff4d4d"}>{`  ${t} ${p.price} ${p.change24h >= 0 ? "▲" : "▼"}${Math.abs(p.change24h)}%  `}</tspan>
                ))}
              </text>
            ))}
          </g>
        )}
        {kind === "storm" && (
          <>
            {n(4).map((i) => <ellipse key={i} className="cloud" cx={80 + i * 200} cy={10} rx="90" ry="22" fill="#50566e" />)}
            {n(3).map((i) => <path key={i} className="bolt" opacity="0" d={`M${160 + i * 230} 12l-14 22h12l-10 22 26-30h-12l10-14z`} fill="#ffe74a" />)}
            {n(40).map((i) => <line key={i} className="drop" x1={i * 20 + 5} x2={i * 20} y1="0" y2="10" stroke="#9fb4ff" strokeWidth="1.5" />)}
          </>
        )}
        {kind === "rocket" && (
          <>
            {n(30).map((i) => <circle key={i} className="star" cx={r(i) * W} cy={r(i + 40) * height} r={r(i + 9) * 1.6 + 0.4} fill="#fff" />)}
            <g className="rocket">
              <path d="M0 0l30-10-8 10 8 10z" fill="#ff7a1a" transform="translate(-26 0)" />
              <path d="M0-8h28l12 8-12 8H0z" fill="#e9e7e3" stroke="#1b1b1b" transform="rotate(-20)" />
            </g>
          </>
        )}
        {kind === "sakura" &&
          n(26).map((i) => <path key={i} className="petal" d="M0 0c4-6 10-4 8 2s-8 6-8-2z" fill={i % 3 ? "#f5a3c0" : "#fff"} stroke="#e07a9a" strokeWidth=".6" />)}
        {kind === "pool" && (
          <>
            {n(2).map((i) => (
              <path key={i} className="wave" d={`M0 ${height * 0.55 + i * 8} ${n(12).map((k) => `q50 ${k % 2 ? 10 : -10} 100 0`).join(" ")} V${height} H0z`} fill={i ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.28)"} />
            ))}
            {n(14).map((i) => <circle key={i} className="bubble" cx={30 + i * 55} cy={height} r={2 + r(i) * 4} fill="none" stroke="#fff" />)}
          </>
        )}
        {kind === "fire" &&
          n(22).map((i) => (
            <path key={i} className="flame" transform={`translate(${i * 38 + 6} ${height})`} d="M0 0c-10-14 6-22 2-40 10 12 18 24 10 40z" fill={i % 2 ? "#ff7a1a" : "#f7d417"} opacity=".9" />
          ))}
      </svg>
      {label && (
        <div style={{ position: "absolute", left: 8, bottom: 6, color: "#fff", background: "rgba(10, 20, 60, .72)", border: "1px solid rgba(255,255,255,.35)", borderRadius: 3, padding: "1px 8px", fontWeight: 800, fontSize: 14, textShadow: "1px 1px 0 #000" }}>{label}</div>
      )}
    </div>
  );
}
