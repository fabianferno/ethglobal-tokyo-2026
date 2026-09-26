"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ShellProps } from "./AppFrame";

/**
 * Doom shell: renders a function's risk data as a low-res first-person raycaster — the way
 * shareware DOOM looked in '95. Your risky positions become the monsters, margin/health is the
 * HEALTH bar, stablecoin reserves are AMMO. Pure canvas (no WebGL, no dependency).
 * Playable in a window: click to focus, WASD / arrows to move and turn, Q/E strafe, click or Space to
 * shoot. The Start-menu preview (and an unfocused window) runs an attract-mode pan instead.
 * Accepts RiskyGrid / Gauge / Table / List, so perps, loan-guard, portfolio all "play".
 */

type Foe = { label: string; hp: number };

/** Turn whatever the function produced into a set of monsters + a health/ammo readout. */
function threat(b: ShellProps["bundle"]): { foes: Foe[]; health: number; ammo: number } {
  let foes: Foe[] = [];
  if (b.grid) {
    foes = b.grid.cells
      .flat()
      .filter((c) => c.mine || c.risk > 0.4)
      .sort((a, z) => z.risk - a.risk)
      .slice(0, 8)
      .map((c) => ({ label: c.label, hp: Math.max(10, Math.round(c.risk * 100)) }));
  }
  if (foes.length === 0 && b.table && b.table.rows.length) {
    const rows = b.table.rows;
    const labelKey = b.table.columns.find((c) => typeof rows[0][c.key] === "string")?.key ?? b.table.columns[0].key;
    const numKey = b.table.columns.find((c) => typeof rows[0][c.key] === "number")?.key;
    foes = rows.slice(0, 8).map((r) => ({ label: String(r[labelKey] ?? "?").replace(/\.eth$/, ""), hp: numKey ? Math.max(10, Math.min(100, Math.round(Math.abs(Number(r[numKey]) || 40)))) : 55 }));
  }
  if (foes.length === 0 && b.list) foes = b.list.items.slice(0, 8).map((it) => ({ label: it.title, hp: 55 }));
  if (foes.length === 0) foes = [{ label: b.gauge?.label ?? "DEMON", hp: b.gauge ? Math.round(b.gauge.value * 100) : 66 }];

  // High "degen/leverage/risk" gauges mean LOW health, the doom way; a plain health-factor gauge maps straight.
  const danger = /degen|leverage|risk|volatil/i.test(`${b.title} ${b.subtitle} ${b.gauge?.label ?? ""}`);
  const g = b.gauge?.value ?? 0.75;
  const health = Math.round((danger ? 1 - g : g) * 100);
  const ammo = Math.max(foes.length * 6, 24);
  return { foes, health, ammo };
}

// 8×8 arena: solid border with two pillars for depth. Player starts in the middle.
const MAP = [
  1, 1, 1, 1, 1, 1, 1, 1,
  1, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 1, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 1, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 1,
  1, 1, 1, 1, 1, 1, 1, 1,
];
const MS = 8;
const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MS || y >= MS ? 1 : MAP[y * MS + x]);
/** True when a circle of radius r at (x, y) overlaps no wall cell. */
const free = (x: number, y: number, r = 0.22) =>
  !at(Math.floor(x - r), Math.floor(y - r)) && !at(Math.floor(x + r), Math.floor(y - r)) && !at(Math.floor(x - r), Math.floor(y + r)) && !at(Math.floor(x + r), Math.floor(y + r));

const MOVE = 2.4; // cells / s
const TURN = 2.6; // rad / s
const DAMAGE = 34; // 1–3 shots per demon
const GAME_KEYS = new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "r"]);

type Sprite = { x: number; y: number; f: Foe; hp: number; hurt: number; dying: number };
type Phase = "idle" | "play" | "won" | "dry";
/** The round is over: every demon down ("won") or out of ammo with demons left ("dry"). */
const ended = (p: Phase) => p === "won" || p === "dry";

export function DoomShell({ bundle, preview }: ShellProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { foes, health, ammo: startAmmo } = useMemo(() => threat(bundle), [bundle]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [ammo, setAmmo] = useState(startAmmo);
  const [alive, setAlive] = useState(foes.length);
  // Input + a restart trigger live in refs so the render loop reads them without re-subscribing.
  const keys = useRef(new Set<string>());
  const fireQueued = useRef(false);
  const turnDelta = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const [round, setRound] = useState(0);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const player = { x: 4.5, y: 4.5, a: 0 };
    let shots = startAmmo;
    let flash = 0;

    // Monsters ringed around the start, pulled in until they stand in an open cell.
    const sprites: Sprite[] = foes.map((f, i) => {
      const ang = (i / foes.length) * Math.PI * 2 + 0.4;
      let r = 2.1 + (i % 3) * 0.5;
      let x = player.x + Math.cos(ang) * r, y = player.y + Math.sin(ang) * r;
      while (!free(x, y, 0.3) && r > 1) {
        r -= 0.2;
        x = player.x + Math.cos(ang) * r;
        y = player.y + Math.sin(ang) * r;
      }
      return { x, y, f, hp: f.hp, hurt: 0, dying: 0 };
    });

    const shoot = (dx: number, dy: number, planeX: number, planeY: number, zbuf: Float32Array) => {
      if (shots <= 0) return;
      shots -= 1;
      setAmmo(shots);
      flash = 0.12;
      // Hitscan down the crosshair column: nearest live demon whose sprite covers the centre and isn't behind a wall.
      const inv = 1 / (planeX * dy - dx * planeY);
      let best: Sprite | null = null;
      let bestDepth = Infinity;
      for (const s of sprites) {
        if (s.hp <= 0) continue;
        const relX = s.x - player.x, relY = s.y - player.y;
        const tx = inv * (dy * relX - dx * relY);
        const ty = inv * (-planeY * relX + planeX * relY);
        if (ty <= 0.2 || ty >= zbuf[W >> 1]) continue;
        const scrX = (W / 2) * (1 + tx / ty);
        const halfW = (Math.min(H * 1.1, H / ty) * 0.6) / 2;
        if (Math.abs(scrX - W / 2) <= halfW * 0.8 && ty < bestDepth) {
          best = s;
          bestDepth = ty;
        }
      }
      if (best) {
        best.hp -= DAMAGE;
        best.hurt = 0.15;
        if (best.hp <= 0) {
          best.dying = 0.5;
          setAlive(sprites.filter((s) => s.hp > 0).length);
        }
      }
      const left = sprites.filter((s) => s.hp > 0).length;
      if (left === 0) setPhaseBoth("won");
      else if (shots === 0) setPhaseBoth("dry");
    };

    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const zbuf = new Float32Array(W);

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const live = !preview && phaseRef.current === "play";

      if (live) {
        const k = keys.current;
        let turn = turnDelta.current;
        turnDelta.current = 0;
        if (k.has("arrowleft") || k.has("a")) turn -= TURN * dt;
        if (k.has("arrowright") || k.has("d")) turn += TURN * dt;
        player.a += turn;
        const fx = Math.cos(player.a), fy = Math.sin(player.a);
        let mx = 0, my = 0;
        if (k.has("arrowup") || k.has("w")) { mx += fx; my += fy; }
        if (k.has("arrowdown") || k.has("s")) { mx -= fx; my -= fy; }
        if (k.has("q")) { mx += fy; my -= fx; }
        if (k.has("e")) { mx -= fy; my += fx; }
        const len = Math.hypot(mx, my);
        if (len > 0) {
          const step = (MOVE * dt) / len;
          // Slide along walls: try each axis separately.
          if (free(player.x + mx * step, player.y)) player.x += mx * step;
          if (free(player.x, player.y + my * step)) player.y += my * step;
        }
      } else if (!ended(phaseRef.current)) {
        player.a = t * 0.5; // attract-mode: pan the camera
      }

      const dx = Math.cos(player.a), dy = Math.sin(player.a);
      const planeX = -dy * 0.66, planeY = dx * 0.66;
      const px = player.x, py = player.y;

      // ceiling + floor
      ctx.fillStyle = "#20242e";
      ctx.fillRect(0, 0, W, H / 2);
      const fg = ctx.createLinearGradient(0, H / 2, 0, H);
      fg.addColorStop(0, "#3a2a22");
      fg.addColorStop(1, "#120d0a");
      ctx.fillStyle = fg;
      ctx.fillRect(0, H / 2, W, H / 2);

      // walls via DDA
      for (let x = 0; x < W; x++) {
        const cam = (2 * x) / W - 1;
        const rdx = dx + planeX * cam, rdy = dy + planeY * cam;
        let mapX = Math.floor(px), mapY = Math.floor(py);
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
        let stepX, stepY, sideDX, sideDY;
        if (rdx < 0) { stepX = -1; sideDX = (px - mapX) * ddx; } else { stepX = 1; sideDX = (mapX + 1 - px) * ddx; }
        if (rdy < 0) { stepY = -1; sideDY = (py - mapY) * ddy; } else { stepY = 1; sideDY = (mapY + 1 - py) * ddy; }
        let side = 0, hit = 0, guard = 0;
        while (hit === 0 && guard++ < 32) {
          if (sideDX < sideDY) { sideDX += ddx; mapX += stepX; side = 0; } else { sideDY += ddy; mapY += stepY; side = 1; }
          if (at(mapX, mapY) > 0) hit = 1;
        }
        const dist = side === 0 ? sideDX - ddx : sideDY - ddy;
        zbuf[x] = dist;
        const lh = Math.min(H * 3, (H / Math.max(dist, 0.05)) | 0);
        const y0 = Math.max(0, (H - lh) >> 1), y1 = Math.min(H, (H + lh) >> 1);
        // brick shading: darker with distance + darker on Y-sides, subtle mortar banding
        const shade = Math.max(0.15, 1 - dist / 9) * (side ? 0.7 : 1);
        const band = (Math.floor((mapX + mapY) * 2) % 2 ? 1 : 0.86);
        const r = Math.round(150 * shade * band), g = Math.round(46 * shade), b = Math.round(38 * shade);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y0, 1, y1 - y0);
      }

      if (live && fireQueued.current) shoot(dx, dy, planeX, planeY, zbuf);
      fireQueued.current = false;

      // sprites (monsters), far→near, occluded by walls via zbuffer
      const inv = 1 / (planeX * dy - dx * planeY);
      const order = sprites
        .filter((s) => s.hp > 0 || s.dying > 0)
        .map((s) => ({ s, d: (s.x - px) ** 2 + (s.y - py) ** 2 }))
        .sort((a, z) => z.d - a.d);
      for (const { s } of order) {
        s.hurt = Math.max(0, s.hurt - dt);
        if (s.hp <= 0) s.dying = Math.max(0, s.dying - dt);
        const relX = s.x - px, relY = s.y - py;
        const tx = inv * (dy * relX - dx * relY);
        const ty = inv * (-planeY * relX + planeX * relY); // depth
        if (ty <= 0.2) continue;
        const scrX = ((W / 2) * (1 + tx / ty)) | 0;
        const size = Math.min(H * 1.1, Math.abs((H / ty) | 0));
        // Dying demons sink into the floor.
        const sink = s.hp <= 0 ? (1 - s.dying / 0.5) * size : 0;
        const sy0 = (((H - size) / 2) | 0) + sink;
        drawImp(ctx, scrX, sy0, size, H, s, zbuf, W, ty);
      }

      // gun + muzzle flash + crosshair
      flash = Math.max(0, flash - dt);
      drawGun(ctx, W, H, live ? t * (keys.current.size ? 2 : 0.4) : t, flash > 0);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(W / 2 - 4, H / 2); ctx.lineTo(W / 2 + 4, H / 2);
      ctx.moveTo(W / 2, H / 2 - 4); ctx.lineTo(W / 2, H / 2 + 4);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [foes, startAmmo, preview, round]);

  const restart = () => {
    setAmmo(startAmmo);
    setAlive(foes.length);
    setRound((r) => r + 1);
    setPhaseBoth("play");
    canvas.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!GAME_KEYS.has(k)) return;
    e.preventDefault(); // keep arrows/space from scrolling the window
    if (ended(phaseRef.current)) {
      if (k === "r" || k === " ") restart();
      return;
    }
    if (k === " ") fireQueued.current = true;
    else keys.current.add(k);
  };
  const onKeyUp = (e: React.KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (preview) return;
    e.currentTarget.focus();
    if (ended(phaseRef.current)) return restart();
    if (phaseRef.current === "idle") return setPhaseBoth("play");
    fireQueued.current = true;
  };
  // Mouse-look: moving with the button held turns the view.
  const onPointerMove = (e: React.PointerEvent) => {
    if (phaseRef.current === "play" && e.buttons & 1) turnDelta.current += e.movementX * 0.008;
  };
  const onBlur = () => {
    keys.current.clear();
    if (phaseRef.current === "play") setPhaseBoth("idle");
  };

  const face = health > 66 ? "😀" : health > 33 ? "😠" : "😫";
  return (
    <div className="col grow" style={{ minHeight: 0, gap: 4, background: "#000" }}>
      <div className="row" style={{ flex: "none", justifyContent: "space-between", alignItems: "baseline", padding: "0 2px" }}>
        <b style={{ fontSize: preview ? 12 : 15, color: "#e33", letterSpacing: 1 }}>{bundle.title.toUpperCase()}</b>
        <span className="mono" style={{ fontSize: 10, color: "#a55" }}>E1M1 · {alive}/{foes.length} monsters</span>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        <canvas
          ref={canvas}
          width={preview ? 240 : 360}
          height={preview ? 140 : 210}
          tabIndex={preview ? -1 : 0}
          onKeyDown={preview ? undefined : onKeyDown}
          onKeyUp={preview ? undefined : onKeyUp}
          onPointerDown={onPointerDown}
          onPointerMove={preview ? undefined : onPointerMove}
          onBlur={preview ? undefined : onBlur}
          style={{ width: "100%", flex: 1, minHeight: 0, imageRendering: "pixelated", border: "2px solid #111", background: "#000", display: "block", outline: "none", cursor: preview ? undefined : "crosshair" }}
        />
        {!preview && phase !== "play" && (
          <div
            // mousedown would move focus off the canvas (and blur-pause the game), so start on click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={ended(phase) ? restart : () => { setPhaseBoth("play"); canvas.current?.focus(); }}
            style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.45)", cursor: "pointer", textAlign: "center", fontFamily: "monospace" }}
          >
            {phase === "won" ? (
              <div>
                <div style={{ color: "#e33", fontWeight: 900, fontSize: 22, letterSpacing: 2 }}>E1M1 COMPLETE</div>
                <div style={{ color: "#ffcf3a", fontSize: 12, marginTop: 4 }}>KILLS 100% · click or press R to play again</div>
              </div>
            ) : phase === "dry" ? (
              <div>
                <div style={{ color: "#e33", fontWeight: 900, fontSize: 22, letterSpacing: 2 }}>OUT OF AMMO</div>
                <div style={{ color: "#ffcf3a", fontSize: 12, marginTop: 4 }}>{alive} demons left · click or press R to try again</div>
              </div>
            ) : (
              <div>
                <div style={{ color: "#e33", fontWeight: 900, fontSize: 20, letterSpacing: 2 }}>CLICK TO PLAY</div>
                <div style={{ color: "#ccc", fontSize: 11, marginTop: 4 }}>WASD / arrows move · Q E strafe · drag to look · click / SPACE fire</div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* DOOM status bar */}
      <div className="row" style={{ flex: "none", background: "linear-gradient(#5a5a5a,#2f2f2f)", border: "2px solid #111", color: "#ffcf3a", fontWeight: 900, padding: "3px 8px", gap: 12, fontFamily: "monospace", alignItems: "center", justifyContent: "space-between" }}>
        <span>AMMO <b style={{ color: ammo > 0 ? "#fff" : "#ff5030" }}>{ammo}</b></span>
        <span style={{ color: health > 33 ? "#ffcf3a" : "#ff5030" }}>HEALTH <b style={{ color: "#fff" }}>{health}%</b></span>
        <span style={{ fontSize: preview ? 18 : 24 }}>{face}</span>
        <span>ARMS <b style={{ color: "#fff" }}>2 3</b></span>
        <span title={foes.map((f) => f.label).join(", ")}>DEMONS <b style={{ color: "#fff" }}>{alive}</b></span>
      </div>
    </div>
  );
}

/** A billboarded imp: red body, horns, glowing eyes, HP pip — column-clipped by the wall zbuffer. */
function drawImp(ctx: CanvasRenderingContext2D, cx: number, top: number, size: number, H: number, s: Sprite, zbuf: Float32Array, W: number, depth: number) {
  const w = size * 0.6;
  const left = Math.floor(cx - w / 2);
  const floorY = (H + size) / 2; // the sprite's feet; sinking demons are clipped here
  const hurt = s.hurt > 0;
  for (let sx = 0; sx < w; sx++) {
    const col = left + sx;
    if (col < 0 || col >= W || depth >= zbuf[col]) continue; // behind a wall
    const u = sx / w;
    for (let sy = 0; sy < size; sy++) {
      if (top + sy >= floorY) break;
      const v = sy / size;
      // crude imp silhouette
      const inBody = Math.abs(u - 0.5) < 0.34 - 0.2 * v && v > 0.18;
      const inHornL = v < 0.22 && Math.abs(u - 0.34) < 0.05;
      const inHornR = v < 0.22 && Math.abs(u - 0.66) < 0.05;
      if (!inBody && !inHornL && !inHornR) continue;
      let c = hurt ? "#ff6040" : "#8f2b1b";
      if (v > 0.28 && v < 0.4 && (Math.abs(u - 0.4) < 0.05 || Math.abs(u - 0.6) < 0.05)) c = "#ffd23a"; // eyes
      else if (v > 0.45 && v < 0.55 && Math.abs(u - 0.5) < 0.12) c = "#3a0a06"; // mouth
      else if (inHornL || inHornR) c = "#d9c9a0";
      ctx.fillStyle = c;
      ctx.fillRect(col, top + sy, 1, 1);
    }
  }
  if (s.hp <= 0) return;
  // HP pip + label above the monster
  const barY = Math.max(0, top - 8);
  ctx.fillStyle = "#300";
  ctx.fillRect(left, barY, w, 3);
  ctx.fillStyle = s.hp > 60 ? "#e33" : "#e8a020";
  ctx.fillRect(left, barY, (w * Math.min(100, s.hp)) / 100, 3);
  ctx.fillStyle = "#fff";
  ctx.font = "6px monospace";
  ctx.textAlign = "center";
  ctx.fillText(s.f.label.slice(0, 12), cx, barY - 2);
}

/** Doom pistol bobbing at the bottom-centre, with a muzzle flash when it fires. */
function drawGun(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, firing: boolean) {
  const bob = Math.sin(t * 4) * 3;
  const gx = W / 2, gy = H - 4 + bob + (firing ? 4 : 0);
  if (firing) {
    ctx.fillStyle = "#ffe07a";
    ctx.beginPath();
    ctx.arc(gx, gy - 50, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff6c8";
    ctx.beginPath();
    ctx.arc(gx, gy - 50, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(gx - 8, gy - 26, 16, 26);
  ctx.fillStyle = "#565656";
  ctx.fillRect(gx - 5, gy - 40, 10, 16);
  ctx.fillStyle = "#222";
  ctx.fillRect(gx - 3, gy - 44, 6, 6);
}
