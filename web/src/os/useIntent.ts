"use client";

import { useEffect, useRef, useState } from "react";
import { mockClassify } from "@/lib/intent/mock";
import type { IntentResult } from "@/lib/intent/types";

/**
 * Keystroke → /api/intent (Jev, ~0.5s) with a calm-UI gate: raw model output flickers while
 * typing, so the top shell×shape only changes when a challenger wins twice in a row or is very sure.
 */
export function useIntent(text: string) {
  const [result, setResult] = useState<IntentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRaw = useRef<string>("");
  const committed = useRef<IntentResult | null>(null);

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
          body: JSON.stringify({ text: q }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        r = await res.json();
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        r = mockClassify(q);
      } finally {
        setBusy(false);
      }
      const key = `${r.shell.value}:${r.shape.value}`;
      const prev = committed.current;
      const prevKey = prev ? `${prev.shell.value}:${prev.shape.value}` : "";
      const sure = r.shape.confidence > 0.7 || key === lastRaw.current || !prev || key === prevKey;
      lastRaw.current = key;
      // Signals and timing always update; only the headline decision is gated.
      const next = sure ? r : { ...prev!, signals: r.signals, latencyMs: r.latencyMs, model: r.model, source: r.source };
      committed.current = next;
      setResult(next);
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  return { result: text.trim().length < 2 ? null : result, busy };
}
