import type { ShapeKey } from "@/lib/intent/types";
import type { Bundle } from "./shapes";

const DOTS = "░░░░░░";

/** What a window shows while Gemini writes: the right shape, with placeholder content. Deterministic. */
export function skeletonBundle(shape: ShapeKey, title: string): Bundle {
  const base = { title, subtitle: "Writing…", actions: [] };
  switch (shape) {
    case "table":
      return {
        ...base,
        table: {
          columns: [0, 1, 2].map((i) => ({ key: `c${i}`, label: DOTS.slice(0, 4), fmt: "text" as const })),
          rows: Array.from({ length: 5 }, () => ({ c0: DOTS, c1: DOTS.slice(0, 3), c2: DOTS.slice(0, 4) })),
        },
      };
    case "series":
      return { ...base, series: { label: DOTS, unit: "", points: [3, 4, 3.5, 5, 4.5, 6, 5.5, 7] } };
    case "gauge":
      return { ...base, gauge: { value: 0.5, label: DOTS, caption: "Writing…" } };
    case "scene":
      return { ...base, scene: { headline: DOTS, verdict: "Writing…", lines: [DOTS, DOTS], stats: [], stamps: [] } };
    case "grid": {
      const cells = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => ({ mine: false, risk: ((r + c) % 5) / 10, label: DOTS })));
      return { ...base, grid: { asset: title, mark: 0, leverage: [1, 2, 3, 4, 5, 6], offsets: [1, 2, 3, 4, 5, 6], cells } };
    }
    case "doc":
      return { ...base, doc: { text: "Writing…" } };
    case "list":
    case "picture":
      return { ...base, list: { items: Array.from({ length: 4 }, () => ({ title: DOTS, subtitle: DOTS.slice(0, 3) })) } };
  }
}
