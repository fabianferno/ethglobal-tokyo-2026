"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { BarChart } from "@/components/win99/Widgets";
import { balloon } from "@/os/store";
import type { ShellProps } from "./AppFrame";

const PALETTE = ["#000000", "#808080", "#800000", "#808000", "#008000", "#008080", "#000080", "#800080", "#ffffff", "#c0c0c0", "#df2e28", "#f7d417", "#1f9a3a", "#22c6c6", "#2f63d8", "#9b2fd6"];
const TOOLS = ["✎", "✐", "◢", "A", "□", "○", "◆", "⊕", "✂", "⌫"];

/** MS Paint shell: a meme canvas composed from the Scene shape, plus real freehand drawing on top. */
export function PaintShell({ bundle, preview }: ShellProps) {
  const [color, setColor] = useState("#df2e28");
  const [strokes, setStrokes] = useState<{ c: string; d: string }[]>([]);
  const drawing = useRef<string | null>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const scene = bundle.scene;

  useLayoutEffect(() => {
    if (!canvas.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from(".p-head", { y: -80, opacity: 0, duration: 0.5, ease: "back.out(2)" })
        .from(".p-line", { x: -40, opacity: 0, stagger: 0.18, duration: 0.35 }, "-=0.1")
        .from(".p-stamp", { scale: 0, rotation: -90, transformOrigin: "50% 50%", stagger: 0.12, duration: 0.4, ease: "back.out(3)" }, "-=0.2")
        .from(".p-verdict", { scale: 4, opacity: 0, rotation: 30, transformOrigin: "50% 50%", duration: 0.45, ease: "power4.in" }, "-=0.1")
        .to(".p-verdict", { rotation: -10, duration: 0.08, yoyo: true, repeat: 3 });
      gsap.to(".p-stamp", { y: -6, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: 0.2, delay: 2 });
    }, canvas);
    return () => ctx.revert();
  }, [scene?.verdict]);

  const pt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return `${(((e.clientX - r.left) / r.width) * 640).toFixed(0)},${(((e.clientY - r.top) / r.height) * 420).toFixed(0)}`;
  };

  return (
    <div className="row grow" style={{ alignItems: "stretch", gap: 4, minHeight: 0 }}>
      {!preview && (
        <div className="raised" style={{ width: 58, padding: 3, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, alignContent: "start" }}>
          {TOOLS.map((t, i) => (
            <button key={t} className={`btn sm ${i === 0 ? "pressed" : ""}`} style={{ minWidth: 0, width: 24, height: 24, padding: 0 }} onClick={() => i === 9 && setStrokes([])}>{t}</button>
          ))}
        </div>
      )}
      <div className="col grow" style={{ gap: 4, minHeight: 0 }}>
        <div className="sunken grow scroll" style={{ background: "#85827d", padding: 8, minHeight: 0 }}>
          <svg
            ref={canvas}
            viewBox="0 0 640 420"
            style={{ width: "100%", maxWidth: 760, background: "#fff", display: "block", boxShadow: "2px 2px 0 #333", cursor: "crosshair", touchAction: "none" }}
            onPointerDown={(e) => {
              if (preview) return;
              drawing.current = `M${pt(e)}`;
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              setStrokes((s) => [...s, { c: color, d: drawing.current! }]);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              drawing.current += ` L${pt(e)}`;
              const d = drawing.current;
              setStrokes((s) => [...s.slice(0, -1), { c: color, d }]);
            }}
            onPointerUp={() => (drawing.current = null)}
          >
            {scene ? (
              <>
                <rect width="640" height="420" fill="#fffdf2" />
                <text className="p-head" x="320" y="58" textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="44" fill="#fff" stroke="#000" strokeWidth="2.5" paintOrder="stroke">{scene.headline}</text>
                {scene.lines.map((l, i) => (
                  <text key={i} className="p-line" x="28" y={130 + i * 42} fontFamily="'Comic Sans MS', 'Comic Neue', cursive" fontSize="20" fill={["#13389e", "#9b2fd6", "#1f9a3a"][i % 3]}>{l}</text>
                ))}
                <g transform="translate(28 268)">
                  {scene.stats.map((s, i) => (
                    <g key={s.label} transform={`translate(${i * 150} 0)`}>
                      <rect width="140" height="54" fill="#f7d417" stroke="#000" strokeWidth="2" />
                      <text x="8" y="20" fontSize="12" fontFamily="Verdana" fontWeight="700">{s.label}</text>
                      <text x="8" y="42" fontSize="16" fontFamily="Verdana" fontWeight="900" fill="#c21d17">{s.value}</text>
                    </g>
                  ))}
                </g>
                {scene.stamps.map((s, i) => (
                  <text key={i} className="p-stamp" x={500 + (i % 3) * 44} y={120 + Math.floor(i / 3) * 60} fontSize="40">{s}</text>
                ))}
                <g className="p-verdict" transform="translate(470 370) rotate(-10)">
                  <rect x="-140" y="-34" width="280" height="56" fill="none" stroke="#df2e28" strokeWidth="5" rx="6" />
                  <text textAnchor="middle" y="6" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="34" fill="#df2e28" letterSpacing="2">{scene.verdict}</text>
                </g>
              </>
            ) : bundle.table ? (
              <foreignObject x="20" y="20" width="600" height="380">
                <BarChart values={bundle.table.rows.map((r) => Number(Object.values(r).find((v) => typeof v === "number") ?? 0))} labels={bundle.table.rows.map((r) => String(Object.values(r)[0]))} height={360} />
              </foreignObject>
            ) : null}
            {strokes.map((s, i) => <path key={i} d={s.d} fill="none" stroke={s.c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
        </div>
        {!preview && (
          <div className="row" style={{ gap: 6, flex: "none" }}>
            <div className="sunken" style={{ width: 34, height: 34, background: color }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 17px)", gap: 1 }}>
              {PALETTE.map((c) => (
                <button key={c} onClick={() => setColor(c)} aria-label={c} style={{ width: 17, height: 16, background: c, border: "1px solid #1b1b1b", boxShadow: "inset 1px 1px 0 rgba(255,255,255,.4)", padding: 0 }} />
              ))}
            </div>
            <div className="grow" />
            <button className="btn primary" onClick={() => balloon("Sent!", "Roast shared as a link. They will know.")}>Send to…</button>
          </div>
        )}
      </div>
    </div>
  );
}
