"use client";

import { useEffect, useRef, useState } from "react";
import { runCompose } from "@/lib/compose/client";
import type { AppState, Tree } from "@/lib/kit/types";

/** Re-compose whenever `state` changes (after `delayMs`), rendering each level; older composes are dropped. */
export function useComposed(state: AppState, seed: Tree | null, opts: { enabled: boolean; delayMs: number }) {
  const [tree, setTree] = useState<Tree | null>(seed);
  const [info, setInfo] = useState({ composing: false, calls: 0, ms: 0, offline: false });
  const gen = useRef(0);
  const last = useRef<Tree | null>(seed);
  const key = JSON.stringify(state);
  useEffect(() => {
    if (!opts.enabled || !state.prompt.trim()) return;
    const my = ++gen.current;
    const t = setTimeout(async () => {
      setInfo((i) => ({ ...i, composing: true }));
      const r = await runCompose(state, last.current, (tr) => my === gen.current && setTree(tr), { isCurrent: () => my === gen.current }).catch(() => null);
      if (!r || my !== gen.current) return;
      last.current = r.tree;
      setInfo({ composing: false, calls: r.calls, ms: r.ms, offline: r.offline });
    }, opts.delayMs);
    return () => clearTimeout(t);
    // `key` is the state's identity; `state` itself is a new object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.enabled, opts.delayMs]);
  return { tree, ...info };
}
