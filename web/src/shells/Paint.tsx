"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { BarChart, fmt } from "@/components/win99/Widgets";
import type { ShellProps } from "./AppFrame";
import { PictureStatus } from "./Picture";

const PALETTE = ["#000000", "#808080", "#800000", "#808000", "#008000", "#008080", "#000080", "#800080", "#ffffff", "#c0c0c0", "#df2e28", "#f7d417", "#1f9a3a", "#22c6c6", "#2f63d8", "#9b2fd6"];
const TOOLS = ["✎", "✐", "◢", "A", "□", "○", "◆", "⊕", "✂", "⌫"];

/** Font size that fits `text` into `width` px (Impact/Comic Sans run ~0.5 em per glyph), clamped. */
const fit = (text: string, width: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(width / (Math.max(1, text.length) * 0.5))));

/** MS Paint shell: a meme canvas composed from the Scene shape, plus real freehand drawing on top. */
export function PaintShell({ app, bundle, preview, picture, run }: ShellProps) {
  const [color, setColor] = useState("#df2e28");
  const [strokes, setStrokes] = useState<{ c: string; d: string }[]>([]);
  const drawing = useRef<string | null>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const scene = bundle.scene;
  // A requested picture fills the canvas when it's the whole app; next to a chart or roast it's a sticker.
  const fullPicture = !!picture && app.shape === "picture";
  const box = fullPicture ? { x: 0, y: 0, width: 640, height: 420 } : { x: 452, y: 64, width: 176, height: 132 };

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
            {fullPicture ? null : scene ? (
              <>
                <rect width="640" height="420" fill="#fffdf2" />
                <text className="p-head" x="320" y="58" textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontSize={fit(scene.headline, 600, 22, 44)} fill="#fff" stroke="#000" strokeWidth="2.5" paintOrder="stroke">{scene.headline}</text>
                {scene.lines.slice(0, 3).map((l, i) => (
                  <text key={i} className="p-line" x="28" y={122 + i * 44} fontFamily="'Comic Sans MS', 'Comic Neue', cursive" fontSize={fit(l, 584, 12, 20)} fill={["#13389e", "#9b2fd6", "#1f9a3a"][i % 3]}>{l}</text>
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
                {scene.stamps.slice(0, 3).map((s, i) => (
                  // Rubber stamps: one word each, stacked bottom-left next to the verdict, slightly rotated.
                  <text key={i} className="p-stamp" x={96} y={352 + i * 26} fontSize="18" fontWeight="900" textAnchor="middle" fill="#df2e28" stroke="#7a0f0b" strokeWidth=".6" transform={`rotate(-12 96 ${352 + i * 26})`}>
                    {s.toUpperCase()}
                  </text>
                ))}
                {(() => {
                  // The verdict is a stamp right of the stamps; shrink it to fit 380 px.
                  const fs = fit(scene.verdict, 380, 12, 30);
                  const w = Math.min(400, scene.verdict.length * fs * 0.5 + 30);
                  return (
                    <g className="p-verdict" transform="translate(410 370) rotate(-4)">
                      <rect x={-w / 2} y={-fs - 4} width={w} height={fs + 22} fill="#fffef6" stroke="#df2e28" strokeWidth="4" rx="6" />
                      <text textAnchor="middle" y="6" fontFamily="Impact, 'Arial Black', sans-serif" fontSize={fs} fill="#df2e28" letterSpacing="1">
                        {scene.verdict}
                      </text>
                    </g>
                  );
                })()}
              </>
            ) : bundle.series ? (
              (() => {
                const pts = bundle.series.points;
                const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
                const X = (i: number) => 56 + (i / Math.max(1, pts.length - 1)) * 544;
                const Y = (v: number) => 372 - ((v - min) / span) * 300;
                const d = pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
                const fmtV = (v: number) => fmt(v, "num", bundle.series!.unit);
                return (
                  <>
                    <rect width="640" height="420" fill="#fffdf2" />
                    <text className="p-head" x="320" y="40" textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="30" fill="#fff" stroke="#000" strokeWidth="2" paintOrder="stroke">{bundle.title}</text>
                    <line x1="56" y1="60" x2="56" y2="372" stroke="#000" strokeWidth="2" />
                    <line x1="56" y1="372" x2="608" y2="372" stroke="#000" strokeWidth="2" />
                    <text x="52" y="66" textAnchor="end" fontFamily="'Comic Sans MS', cursive" fontSize="13">{fmtV(max)}</text>
                    <text x="52" y="372" textAnchor="end" fontFamily="'Comic Sans MS', cursive" fontSize="13">{fmtV(min)}</text>
                    <path className="p-line" d={d} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
                    <circle cx={X(pts.length - 1)} cy={Y(pts[pts.length - 1])} r="6" fill={color} stroke="#000" strokeWidth="1.5" />
                    <text x={X(pts.length - 1)} y={Y(pts[pts.length - 1]) - 12} textAnchor="middle" fontFamily="Impact" fontSize="18" fill="#000">{fmtV(pts[pts.length - 1])}</text>
                  </>
                );
              })()
            ) : bundle.table ? (
              <foreignObject x="20" y="20" width="600" height="380">
                <BarChart values={bundle.table.rows.map((r) => Number(Object.values(r).find((v) => typeof v === "number") ?? 0))} labels={bundle.table.rows.map((r) => String(Object.values(r)[0]))} height={360} />
              </foreignObject>
            ) : bundle.list ? (
              <>
                <rect width="640" height="420" fill="#fffdf2" />
                <text className="p-head" x="320" y="42" textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="30" fill="#fff" stroke="#000" strokeWidth="2" paintOrder="stroke">{bundle.title}</text>
                {bundle.list.items.slice(0, 6).map((it, i) => {
                  const x = 34 + (i % 2) * 300, y = 74 + Math.floor(i / 2) * 108;
                  const tone = it.tone === "up" ? "#c9f5cf" : it.tone === "down" ? "#f7c9c9" : it.tone === "warn" ? "#fdeeb3" : "#fff7c0";
                  return (
                    <g key={i} className="p-line" transform={`translate(${x} ${y}) rotate(${i % 2 ? 2 : -2})`}>
                      <rect width="276" height="92" fill={tone} stroke="#000" strokeWidth="2" />
                      <text x="12" y="26" fontFamily="'Comic Sans MS', 'Comic Neue', cursive" fontSize="15" fontWeight="700">{(it.title ?? "").slice(0, 26)}</text>
                      {it.subtitle && <text x="12" y="48" fontFamily="'Comic Sans MS', 'Comic Neue', cursive" fontSize="12" fill="#555">{it.subtitle.slice(0, 30)}</text>}
                      {it.right && <text x="264" y="82" textAnchor="end" fontFamily="Impact, sans-serif" fontSize="18" fill="#c21d17">{it.right}</text>}
                    </g>
                  );
                })}
              </>
            ) : null}
            {picture &&
              (picture.src ? (
                <g>
                  {!fullPicture && <rect x={box.x - 4} y={box.y - 4} width={box.width + 8} height={box.height + 8} fill="#fff" stroke="#000" strokeWidth="2" transform={`rotate(3 ${box.x + box.width / 2} ${box.y + box.height / 2})`} />}
                  <image href={picture.src} {...box} preserveAspectRatio={fullPicture ? "xMidYMid meet" : "xMidYMid slice"} transform={fullPicture ? undefined : `rotate(3 ${box.x + box.width / 2} ${box.y + box.height / 2})`} />
                </g>
              ) : (
                <foreignObject {...box}>
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fffdf2", border: fullPicture ? "none" : "2px dashed #000" }}>
                    <PictureStatus pic={picture} />
                  </div>
                </foreignObject>
              ))}
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
            {bundle.actions.map((a) => (
              <button key={a.id} className={`btn ${a.primary ? "primary" : ""}`} onClick={() => run(a)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
