import type { ReactNode } from "react";

/** Chunky 32×32 retro icons. Dark outline + flat fills + one highlight, like the kit sheet. */
const O = "#1b1b1b";

const icons = {
  logo: (
    <>
      <rect x="3" y="5" width="12" height="11" rx="2" fill="#e5463f" stroke={O} />
      <rect x="17" y="5" width="12" height="11" rx="2" fill="#3aa651" stroke={O} />
      <rect x="3" y="18" width="12" height="11" rx="2" fill="#2f63d8" stroke={O} />
      <rect x="17" y="18" width="12" height="11" rx="2" fill="#f7d417" stroke={O} />
      <text x="16" y="21" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" stroke={O} strokeWidth=".6" fontFamily="Verdana">99</text>
    </>
  ),
  computer: (
    <>
      <rect x="4" y="4" width="24" height="17" rx="2" fill="#d6d3ce" stroke={O} />
      <rect x="7" y="7" width="18" height="11" fill="#2b5cc7" stroke={O} />
      <path d="M8 8h9l-9 7z" fill="#6e95e6" />
      <rect x="11" y="21" width="10" height="3" fill="#bdbab5" stroke={O} />
      <rect x="5" y="24" width="22" height="5" rx="1" fill="#d6d3ce" stroke={O} />
      <rect x="20" y="26" width="5" height="1.5" fill="#1f9a3a" />
    </>
  ),
  folder: (
    <>
      <path d="M3 8h9l3 3h14v16H3z" fill="#e8b92b" stroke={O} strokeLinejoin="round" />
      <path d="M3 13h26v14H3z" fill="#f7d86a" stroke={O} strokeLinejoin="round" />
      <path d="M5 15h22" stroke="#fff6c8" strokeWidth="1.5" />
    </>
  ),
  network: (
    <>
      <rect x="2" y="3" width="13" height="10" rx="1" fill="#d6d3ce" stroke={O} />
      <rect x="4" y="5" width="9" height="6" fill="#2b5cc7" />
      <rect x="17" y="12" width="13" height="10" rx="1" fill="#d6d3ce" stroke={O} />
      <rect x="19" y="14" width="9" height="6" fill="#2b5cc7" />
      <path d="M8 13v12h15v-3" fill="none" stroke={O} strokeWidth="2" />
      <circle cx="8" cy="26" r="3" fill="#22c6c6" stroke={O} />
    </>
  ),
  recycle: (
    <>
      <path d="M7 9h18l-2 19H9z" fill="#c9d3dc" stroke={O} strokeLinejoin="round" />
      <rect x="5" y="6" width="22" height="4" rx="1" fill="#e9e7e3" stroke={O} />
      <path d="M12 15l3-3 3 3M15 12v6M20 18l-1 4h-4M11 19l1 3" fill="none" stroke="#1f9a3a" strokeWidth="1.8" />
    </>
  ),
  document: (
    <>
      <path d="M7 3h13l6 6v20H7z" fill="#fff" stroke={O} strokeLinejoin="round" />
      <path d="M20 3v6h6" fill="#d6d3ce" stroke={O} strokeLinejoin="round" />
      <path d="M10 14h12M10 18h12M10 22h8" stroke="#85827d" strokeWidth="1.5" />
    </>
  ),
  notepad: (
    <>
      <rect x="6" y="5" width="20" height="24" fill="#fff" stroke={O} />
      <rect x="6" y="3" width="20" height="5" fill="#6e95e6" stroke={O} />
      <path d="M9 13h14M9 17h14M9 21h14M9 25h9" stroke="#6e95e6" strokeWidth="1.3" />
    </>
  ),
  excel: (
    <>
      <rect x="4" y="4" width="24" height="24" rx="2" fill="#fff" stroke={O} />
      <path d="M4 10h24M4 16h24M4 22h24M12 4v24M20 4v24" stroke="#85827d" />
      <rect x="4" y="4" width="24" height="6" fill="#1f9a3a" stroke={O} />
      <path d="M13 19l3 3 6-9" fill="none" stroke="#1f9a3a" strokeWidth="2.5" />
    </>
  ),
  paint: (
    <>
      <ellipse cx="15" cy="17" rx="12" ry="10" fill="#f3e2b8" stroke={O} />
      <circle cx="9" cy="14" r="2.5" fill="#df2e28" stroke={O} strokeWidth=".6" />
      <circle cx="14" cy="11" r="2.5" fill="#f7d417" stroke={O} strokeWidth=".6" />
      <circle cx="20" cy="12" r="2.5" fill="#2f63d8" stroke={O} strokeWidth=".6" />
      <circle cx="10" cy="20" r="2.5" fill="#1f9a3a" stroke={O} strokeWidth=".6" />
      <path d="M18 29l11-15 2 1-10 16z" fill="#9b2fd6" stroke={O} />
    </>
  ),
  mine: (
    <>
      <rect x="3" y="3" width="26" height="26" rx="2" fill="#bdbab5" stroke={O} />
      <path d="M16 6v20M6 16h20M9 9l14 14M23 9L9 23" stroke={O} strokeWidth="2" />
      <circle cx="16" cy="16" r="7" fill={O} />
      <circle cx="13.5" cy="13.5" r="2" fill="#fff" />
    </>
  ),
  weather: (
    <>
      <circle cx="12" cy="12" r="7" fill="#f7d417" stroke={O} />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" stroke="#e8a317" strokeWidth="1.5" />
      <path d="M11 27a5 5 0 010-10 7 7 0 0113 2 4 4 0 010 8z" fill="#fff" stroke={O} />
    </>
  ),
  chart: (
    <>
      <rect x="3" y="4" width="26" height="24" rx="1" fill="#fff" stroke={O} />
      <rect x="7" y="17" width="4" height="8" fill="#2f63d8" stroke={O} strokeWidth=".7" />
      <rect x="14" y="11" width="4" height="14" fill="#1f9a3a" stroke={O} strokeWidth=".7" />
      <rect x="21" y="7" width="4" height="18" fill="#df2e28" stroke={O} strokeWidth=".7" />
    </>
  ),
  coin: (
    <>
      <ellipse cx="16" cy="19" rx="12" ry="8" fill="#c79712" stroke={O} />
      <ellipse cx="16" cy="15" rx="12" ry="8" fill="#f7d417" stroke={O} />
      <ellipse cx="16" cy="15" rx="8" ry="5" fill="none" stroke="#c79712" strokeWidth="1.5" />
      <text x="16" y="18.5" textAnchor="middle" fontSize="9" fontWeight="900" fill="#8a6408" fontFamily="Verdana">$</text>
    </>
  ),
  people: (
    <>
      <circle cx="11" cy="10" r="5" fill="#f1c9a0" stroke={O} />
      <path d="M2 28a9 9 0 0118 0z" fill="#2f63d8" stroke={O} />
      <circle cx="22" cy="12" r="4.5" fill="#e0b088" stroke={O} />
      <path d="M15 28a8 8 0 0116 0z" fill="#1f9a3a" stroke={O} />
    </>
  ),
  clock: (
    <>
      <circle cx="16" cy="16" r="13" fill="#fff" stroke={O} strokeWidth="1.5" />
      <path d="M16 7v9l6 4" fill="none" stroke={O} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.5" fill="#df2e28" />
    </>
  ),
  shop: (
    <>
      <rect x="5" y="14" width="22" height="14" fill="#e9e7e3" stroke={O} />
      <path d="M3 8h26l-2 7H5z" fill="#df2e28" stroke={O} strokeLinejoin="round" />
      <path d="M9 8l-1 7M16 8v7M23 8l1 7" stroke="#fff" strokeWidth="1.5" />
      <rect x="13" y="19" width="6" height="9" fill="#6e95e6" stroke={O} />
    </>
  ),
  piggy: (
    <>
      <ellipse cx="16" cy="18" rx="12" ry="9" fill="#f5a3c0" stroke={O} />
      <rect x="13" y="7" width="6" height="3" rx="1" fill="#f7d417" stroke={O} />
      <circle cx="23" cy="15" r="1.2" fill={O} />
      <ellipse cx="28" cy="18" rx="2" ry="3" fill="#f0819f" stroke={O} />
      <path d="M8 26v3M22 26v3" stroke={O} strokeWidth="2.5" />
    </>
  ),
  lock: (
    <>
      <path d="M10 14v-4a6 6 0 0112 0v4" fill="none" stroke={O} strokeWidth="3" />
      <rect x="6" y="14" width="20" height="15" rx="2" fill="#f7d417" stroke={O} />
      <circle cx="16" cy="20" r="2" fill={O} />
      <path d="M16 21v4" stroke={O} strokeWidth="2" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 9h26v4a3 3 0 000 6v4H3v-4a3 3 0 000-6z" fill="#9b2fd6" stroke={O} />
      <path d="M21 9v14" stroke="#fff" strokeDasharray="2 2" />
      <path d="M7 14h10M7 18h7" stroke="#fff" strokeWidth="1.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="16" cy="16" r="13" fill="#2f8ad8" stroke={O} />
      <path d="M7 9c4 1 5 4 3 7s1 6 4 7M18 4c-1 3 2 5 5 5s4 4 2 7-1 6-4 7" fill="#3aa651" stroke={O} strokeWidth=".8" />
      <ellipse cx="11" cy="9" rx="4" ry="2" fill="rgba(255,255,255,.45)" />
    </>
  ),
  search: (
    <>
      <circle cx="13" cy="13" r="9" fill="#cde3ff" stroke={O} strokeWidth="2" />
      <path d="M10 9a5 5 0 014-2" stroke="#fff" strokeWidth="2" fill="none" />
      <path d="M19.5 19.5l8 8" stroke={O} strokeWidth="5" strokeLinecap="round" />
      <path d="M19.5 19.5l8 8" stroke="#2f63d8" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  run: (
    <>
      <rect x="3" y="7" width="26" height="18" rx="2" fill="#d6d3ce" stroke={O} />
      <rect x="6" y="10" width="20" height="4" fill="#fff" stroke={O} strokeWidth=".7" />
      <path d="M9 18h14l-3-3M23 18l-3 3" fill="none" stroke="#2f63d8" strokeWidth="2" />
    </>
  ),
  settings: (
    <>
      <path d="M16 3l3 4 5-1 1 5 4 3-3 4 1 5-5 1-1 5-5-2-5 2-1-5-5-1 1-5-3-4 4-3 1-5 5 1z" fill="#bdbab5" stroke={O} strokeLinejoin="round" />
      <circle cx="16" cy="16" r="5" fill="#e9e7e3" stroke={O} />
    </>
  ),
  task: (
    <>
      <rect x="3" y="4" width="26" height="24" rx="2" fill="#111" stroke={O} />
      <path d="M5 20l5-6 4 4 5-9 4 5 4-3" fill="none" stroke="#3aff6a" strokeWidth="2" />
      <path d="M3 24h26" stroke="#1f9a3a" />
    </>
  ),
  agent: (
    <>
      <rect x="6" y="9" width="20" height="16" rx="4" fill="#6e95e6" stroke={O} />
      <circle cx="12" cy="17" r="2.5" fill="#fff" stroke={O} />
      <circle cx="20" cy="17" r="2.5" fill="#fff" stroke={O} />
      <path d="M16 9V4" stroke={O} strokeWidth="2" />
      <circle cx="16" cy="4" r="2" fill="#df2e28" stroke={O} />
      <path d="M12 22h8" stroke={O} strokeWidth="1.5" />
    </>
  ),
  warning: (
    <>
      <path d="M16 3l14 25H2z" fill="#f7d417" stroke={O} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="14.5" y="11" width="3" height="9" rx="1" fill={O} />
      <circle cx="16" cy="24" r="1.8" fill={O} />
    </>
  ),
  error: (
    <>
      <circle cx="16" cy="16" r="13" fill="#df2e28" stroke={O} strokeWidth="1.5" />
      <path d="M11 11l10 10M21 11L11 21" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  info: (
    <>
      <path d="M16 3a13 12 0 11-9 21l-4 5 7-2" fill="#fff" stroke={O} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="16" cy="9" r="2" fill="#2f63d8" />
      <rect x="14" y="13" width="4" height="11" rx="1" fill="#2f63d8" />
    </>
  ),
  question: (
    <>
      <path d="M16 3a13 12 0 11-9 21l-4 5 7-2" fill="#fff" stroke={O} strokeWidth="1.5" strokeLinejoin="round" />
      <text x="16" y="21" textAnchor="middle" fontSize="16" fontWeight="900" fill="#2f63d8" fontFamily="Verdana">?</text>
    </>
  ),
  shutdown: (
    <>
      <circle cx="16" cy="17" r="11" fill="#df2e28" stroke={O} />
      <path d="M11 12a7 7 0 1010 0" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 8v9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  rocket: (
    <>
      <path d="M16 2c6 5 7 12 4 20h-8C9 14 10 7 16 2z" fill="#e9e7e3" stroke={O} />
      <circle cx="16" cy="11" r="3" fill="#6e95e6" stroke={O} />
      <path d="M12 18l-5 5 5 0M20 18l5 5-5 0" fill="#df2e28" stroke={O} strokeLinejoin="round" />
      <path d="M13 23l3 7 3-7z" fill="#f7d417" stroke={O} strokeLinejoin="round" />
    </>
  ),
  pool: (
    <>
      <circle cx="16" cy="16" r="13" fill="#22c6c6" stroke={O} />
      <circle cx="16" cy="16" r="8" fill="#fff" stroke={O} />
      <path d="M16 3a13 13 0 0113 13h-5a8 8 0 00-8-8z" fill="#2f63d8" stroke={O} />
    </>
  ),
  flame: (
    <>
      <path d="M16 2c2 6 9 9 9 17a9 9 0 01-18 0c0-5 3-7 4-11 1 3 2 4 3 4 0-4 0-7 2-10z" fill="#ff7a1a" stroke={O} strokeLinejoin="round" />
      <path d="M16 15c1 3 4 4 4 8a4 4 0 01-8 0c0-3 2-4 4-8z" fill="#f7d417" />
    </>
  ),
  bomb: (
    <>
      <circle cx="14" cy="19" r="10" fill="#222" stroke={O} />
      <circle cx="10" cy="15" r="2.5" fill="#777" />
      <path d="M20 11l4-4" stroke={O} strokeWidth="3" />
      <path d="M25 6l2-2M26 8h3M24 4V1" stroke="#ff7a1a" strokeWidth="2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="7" width="26" height="18" rx="1" fill="#fff" stroke={O} />
      <path d="M3 7l13 10L29 7" fill="#e9e7e3" stroke={O} strokeLinejoin="round" />
    </>
  ),
  calc: (
    <>
      <rect x="6" y="3" width="20" height="26" rx="2" fill="#bdbab5" stroke={O} />
      <rect x="9" y="6" width="14" height="6" fill="#c8e6b0" stroke={O} strokeWidth=".7" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={9 + c * 5} y={15 + r * 4.5} width="4" height="3.5" fill={c === 2 && r === 2 ? "#df2e28" : "#e9e7e3"} stroke={O} strokeWidth=".6" />))}
    </>
  ),
  cards: (
    <>
      <rect x="4" y="6" width="15" height="21" rx="2" fill="#fff" stroke={O} transform="rotate(-10 11 16)" />
      <rect x="13" y="5" width="15" height="21" rx="2" fill="#fff" stroke={O} />
      <path d="M20.5 11l3 4-3 4-3-4z" fill="#df2e28" />
    </>
  ),
  music: (
    <>
      <rect x="3" y="5" width="26" height="22" rx="2" fill="#2d3340" stroke={O} />
      <path d="M13 21V10l10-2v11" fill="none" stroke="#f7d417" strokeWidth="2" />
      <circle cx="11" cy="21" r="2.5" fill="#f7d417" />
      <circle cx="21" cy="19" r="2.5" fill="#f7d417" />
    </>
  ),
  help: (
    <>
      <path d="M5 6l11-3 11 3v20l-11 3-11-3z" fill="#9b2fd6" stroke={O} strokeLinejoin="round" />
      <path d="M16 3v26" stroke={O} />
      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="900" fill="#f7d417" fontFamily="Verdana">?</text>
    </>
  ),
  drive: (
    <>
      <path d="M3 13l5-6h16l5 6v10H3z" fill="#bdbab5" stroke={O} strokeLinejoin="round" />
      <path d="M3 13h26" stroke={O} />
      <rect x="21" y="17" width="4" height="2" fill="#3aff6a" stroke={O} strokeWidth=".5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof icons;
export const ICON_NAMES = Object.keys(icons) as IconName[];

export function Icon({ name, size = 32, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden style={{ flex: "none", overflow: "visible" }}>
      {icons[name] ?? icons.document}
    </svg>
  );
}
