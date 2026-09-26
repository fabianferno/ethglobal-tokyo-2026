"use client";

import { useEffect, useRef, useState } from "react";
import { mockClassify } from "@/lib/intent/mock";
import type { Candidate, IntentResult } from "@/lib/intent/types";

/**
 * Keystroke → /api/intent (Jev, ~100ms) with a calm-UI gate: raw model output flickers while
 * typing, so the top shell×fn only changes when a challenger wins twice in a row or is very sure.
 */
export function useIntent(text: string, candidates: Candidate[]) {
  const [result, setResult] = useState<IntentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRaw = useRef<string>("");
  const committed = useRef<IntentResult | null>(null);
  const candKey = candidates.map((c) => c.id).join(",");

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      committed.current = null;
      lastRaw.current = "";
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      let r: IntentResult;
      try {
        const res = await fetch("/api/intent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: q, candidates }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        r = await res.json();
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        r = mockClassify(q, candidates);
      } finally {
        setBusy(false);
      }
      const key = `${r.shell.value}:${r.fn.value}`;
      const prev = committed.current;
      const prevKey = prev ? `${prev.shell.value}:${prev.fn.value}` : "";
      const sure = r.fn.confidence > 0.7 || key === lastRaw.current || !prev || key === prevKey;
      lastRaw.current = key;
      // Matches and signals always update; only the headline decision is gated.
      const next = sure ? r : { ...prev!, matches: r.matches, signals: r.signals, latencyMs: r.latencyMs, model: r.model, source: r.source };
      committed.current = next;
      setResult(next);
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // candidates identity changes every render; candKey is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, candKey]);

  return { result: text.trim().length < 2 ? null : result, busy };
}
