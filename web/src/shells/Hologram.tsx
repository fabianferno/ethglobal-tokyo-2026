"use client";

import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ShellProps } from "./AppFrame";

/**
 * Hologram shell: renders any function's numbers as an old-school, flat-shaded 3D bar chart —
 * rotating on a wireframe grid floor, the way Excel 3-D charts and the 3D Maze screensaver did it.
 * Pure CSS 3D transforms (preserve-3d) on a turntable camera: auto-orbits, drag to look around.
 * No WebGL, no dependency, instant + deterministic.
 * Accepts Table / TimeSeries / Gauge; every shell stays generic (same shapes, real data).
 */

type Bar = { label: string; value: number };

// Chunky Win9x chart palette — each bar cycles through it; faces are shaded off a single base hue.
const PALETTE = ["#12b5b0", "#3f6fd6", "#7d5bd0", "#3fae5a", "#e0a021", "#d6533f", "#4aa3c7", "#c74a9e"];

/** Pull a labelled numeric series out of whatever shape the function produced. */
function bars(b: ShellProps["bundle"]): { data: Bar[]; unit: string } {
  if (b.table && b.table.rows.length) {
    const rows = b.table.rows;
    const isNum = (k: string) => typeof rows[0][k] === "number";
    const prefer = ["value", "apy", "alloc", "amount", "pnl", "spend", "cap", "bal", "v", "price", "s"];
    const numCol = b.table.columns.find((c) => prefer.includes(c.key) && isNum(c.key)) ?? b.table.columns.find((c) => isNum(c.key));
    const labelCol = b.table.columns.find((c) => typeof rows[0][c.key] === "string") ?? b.table.columns[0];
    if (numCol) {
      const fmt = numCol.fmt;
      return {
        data: rows.slice(0, 12).map((r) => ({ label: String(r[labelCol.key] ?? "").replace(/\.eth$/, ""), value: Math.abs(Number(r[numCol.key]) || 0) })),
        unit: fmt === "usd" ? "$" : fmt === "pct" ? "%" : "",
      };
    }
  }
  if (b.series) return { data: b.series.points.slice(-16).map((v, i) => ({ label: String(i + 1), value: Math.abs(v) })), unit: b.series.unit === "usd" ? "$" : "%" };
  if (b.gauge) return { data: [{ label: b.gauge.label, value: b.gauge.value }], unit: "" };
  return { data: [], unit: "" };
}

/**
 * One flat-shaded 3D box: five faces, brightness stepped per face so it reads as lit low-poly.
 * Its footprint is centred on the parent's origin so the turntable spins every bar about its own centre.
 */
function Bar3D({ w, h, d, base }: { w: number; h: number; d: number; base: string }) {
  const face = (t: string, filter: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
    position: "absolute",
    left: "50%",
    bottom: 0,
    background: base,
    filter,
    transform: t,
    transformOrigin: "bottom center",
    outline: "1px solid rgba(0,0,0,0.35)",
    ...extra,
  });
  return (
    <div style={{ position: "absolute", bottom: 0, left: `calc(50% - ${w / 2}px)`, width: w, height: h, transformStyle: "preserve-3d" }}>
      {/* front */}
      <div style={{ ...face(`translateX(-50%) translateZ(${d / 2}px)`, "brightness(1)"), width: w, height: h }} />
      {/* back */}
      <div style={{ ...face(`translateX(-50%) translateZ(${-d / 2}px)`, "brightness(0.55)"), width: w, height: h }} />
      {/* right */}
      <div style={{ ...face(`translateX(-50%) rotateY(90deg) translateZ(${w / 2}px)`, "brightness(0.72)"), width: d, height: h }} />
      {/* left */}
      <div style={{ ...face(`translateX(-50%) rotateY(-90deg) translateZ(${w / 2}px)`, "brightness(0.72)"), width: d, height: h }} />
      {/* top (cap): rotated about its own centre so it covers z ∈ [-d/2, d/2], not just the back half */}
      <div style={{ ...face(`translateX(-50%) translateY(${d / 2 - h}px) rotateX(90deg)`, "brightness(1.35)", { height: d, transformOrigin: "center" }), width: w }} />
    </div>
  );
}

export function HologramShell({ bundle, preview }: ShellProps) {
  const world = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { data, unit } = useMemo(() => bars(bundle), [bundle]);
  // Turntable camera. Yaw spins about the floor's vertical axis; pitch tilts the camera and never
  // spins with it. Both are CSS variables, so the world and the billboard labels read the same numbers.
  const cam = useRef({ yaw: -20, pitch: -24, dragging: false, lastX: 0, lastY: 0, idleAt: 0 });

  useLayoutEffect(() => {
    if (!world.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".holo-bar", { scaleY: 0, transformOrigin: "bottom", stagger: 0.06, duration: 0.5, ease: "back.out(1.7)" });
    }, world);
    return () => ctx.revert();
  }, [bundle]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const c = cam.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Auto-orbit slowly, but hold still while dragging and for a moment after, so the view stays put.
      if (!c.dragging && now > c.idleAt) c.yaw = (c.yaw + dt * 16) % 360;
      el.style.setProperty("--yaw", String(c.yaw));
      el.style.setProperty("--pitch", String(c.pitch));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (preview) return;
    const c = cam.current;
    c.dragging = true;
    c.lastX = e.clientX;
    c.lastY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const c = cam.current;
    if (!c.dragging) return;
    c.yaw += (e.clientX - c.lastX) * 0.5;
    c.pitch = Math.max(-60, Math.min(-6, c.pitch - (e.clientY - c.lastY) * 0.3));
    c.lastX = e.clientX;
    c.lastY = e.clientY;
  };
  const onPointerUp = () => {
    cam.current.dragging = false;
    cam.current.idleAt = performance.now() + 2500;
  };

  const maxV = Math.max(...data.map((d) => d.value), 0.0001);
  const maxH = preview ? 96 : 150;
  const bw = preview ? 20 : 30;
  const gap = preview ? 10 : 16;
  const step = bw + gap;
  const total = data.length * step;
  const floor = Math.max(total + step, preview ? 180 : 300);
  // Bar centres, symmetric about the world origin (the turntable pivot).
  const barX = (i: number) => (i - (data.length - 1) / 2) * step;
  const fmtVal = (v: number) => (unit === "$" ? `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}` : unit === "%" ? `${v.toFixed(1)}%` : v.toFixed(2));

  return (
    <div ref={world} className="col grow" style={{ minHeight: 0, gap: 6 }}>
      <div className="row" style={{ flex: "none", justifyContent: "space-between", alignItems: "baseline" }}>
        <b style={{ fontSize: preview ? 13 : 16 }}>{bundle.title}</b>
        <span className="muted mono" style={{ fontSize: 11 }}>◈ Direct3D · {data.length} obj</span>
      </div>

      {/* Perspective viewport with a dithered CRT-ish sky. */}
      <div
        ref={stage}
        className="sunken grow"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={preview ? undefined : "Drag to look around"}
        style={{
          position: "relative",
          minHeight: preview ? 150 : 240,
          overflow: "hidden",
          perspective: preview ? 520 : 760,
          background: "linear-gradient(#0b1030 0%, #1b2452 45%, #33407e 100%)",
          cursor: preview ? undefined : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* scanline dither for that late-90s GL feel */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)" }} />
        <div
          className="holo-world"
          style={{
            position: "absolute",
            left: "50%",
            top: preview ? "58%" : "62%",
            transformStyle: "preserve-3d",
            // CSS applies right-to-left: spin about the vertical axis first, then tilt the camera.
            // (The old GSAP spin composed these the other way round, so the tilt axis wobbled.)
            transform: "rotateX(calc(var(--pitch, -24) * 1deg)) rotateY(calc(var(--yaw, -20) * 1deg))",
          }}
        >
          {/* wireframe grid floor, centred on the pivot */}
          <div
            style={{
              position: "absolute",
              left: -floor / 2,
              top: -floor / 2,
              width: floor,
              height: floor,
              transform: "rotateX(90deg)",
              transformOrigin: "center",
              background:
                "repeating-linear-gradient(0deg, rgba(90,255,220,0.45) 0 1px, transparent 1px 30px), repeating-linear-gradient(90deg, rgba(90,255,220,0.45) 0 1px, transparent 1px 30px)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.6)",
            }}
          />
          {/* bars, centered on the floor and marching along X */}
          {data.map((b, i) => (
            <div
              key={i}
              className="holo-bar"
              style={{ position: "absolute", left: barX(i), top: 0, transformStyle: "preserve-3d" }}
            >
              <Bar3D w={bw} h={Math.max(4, (b.value / maxV) * maxH)} d={bw} base={PALETTE[i % PALETTE.length]} />
              {/* value billboard: counter-rotates the camera so it always faces the viewer */}
              {!preview && (
                <div
                  style={{
                    position: "absolute",
                    bottom: Math.max(4, (b.value / maxV) * maxH) + 6,
                    left: 0,
                    transform: "translateX(-50%) rotateY(calc(var(--yaw, -20) * -1deg)) rotateX(calc(var(--pitch, -24) * -1deg))",
                    whiteSpace: "nowrap",
                    color: "#eafff9",
                    fontSize: 11,
                    fontWeight: 700,
                    textShadow: "1px 1px 0 #000",
                  }}
                >
                  {fmtVal(b.value)}
                </div>
              )}
              {/* label painted flat on the floor in front of the bar */}
              <div
                style={{ position: "absolute", top: 0, left: 0, transform: `translateZ(${bw / 2 + 4}px) translateX(-50%) rotateX(90deg)`, transformOrigin: "top center", whiteSpace: "nowrap", color: "#bfe9ff", fontSize: 10, textShadow: "1px 1px 0 #000" }}
              >
                {b.label.length > 8 ? b.label.slice(0, 8) : b.label}
              </div>
            </div>
          ))}
        </div>

        {data.length === 0 && (
          <div className="col" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", color: "#cfe0ff" }}>
            <b>No numeric data to plot in 3D.</b>
          </div>
        )}
      </div>

      <div className="row" style={{ flex: "none", justifyContent: "space-between", alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 11 }}>{bundle.subtitle}</span>
      </div>
    </div>
  );
}
