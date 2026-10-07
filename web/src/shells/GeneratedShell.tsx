"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { setPrefer, shellHtml } from "@/lib/genshell/client";
import { SANDBOX, srcdocFor } from "@/lib/genshell/runtime";
import type { ShellInfo } from "@/lib/genshell/types";
import type { ShellProps } from "./AppFrame";

/**
 * An LLM-written shell, running as an untrusted guest: sandboxed iframe (opaque origin, no network),
 * content pushed in, and the only way out is asking for one of the bundle's own actions by id.
 * If the frame ever navigates away from its srcdoc (a second load), it is dropped for the built-in shell.
 */
export function GeneratedShell({ app, bundle, preview, run, shell, fallback }: ShellProps & { shell: ShellInfo; fallback: React.ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loads = useRef(0);

  useEffect(() => {
    let ok = true;
    shellHtml(shell.label)
      .then((h) => ok && setHtml(h))
      .catch((e: Error) => ok && setFailed(e.message));
    return () => {
      ok = false;
    };
  }, [shell.label]);

  const srcdoc = useMemo(() => (html ? srcdocFor(html) : ""), [html]);

  // Push (and re-push) the real data whenever it changes; the shell never fetches anything itself.
  useEffect(() => {
    if (!loaded) return;
    frame.current?.contentWindow?.postMessage({ type: "jev:data", bundle, app: { title: app.title, prompt: app.prompt, vibe: app.vibe, preview: !!preview } }, "*");
  }, [loaded, bundle, app, preview]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data || typeof e.data.type !== "string") return;
      if (e.data.type === "jev:action" && !preview) {
        const a = bundle.actions.find((x) => x.id === e.data.actionId);
        if (a) run(a); // unknown ids are ignored: a shell can only ask for what the trusted function built
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [bundle, run, preview]);

  if (failed) return <>{fallback}</>;
  return (
    <div className="grow col" style={{ minHeight: 0, gap: 3 }}>
      <div className="sunken grow" style={{ minHeight: 0, position: "relative", background: "#000" }}>
        {html && (
          <iframe
            ref={frame}
            title={shell.exe}
            sandbox={SANDBOX}
            srcDoc={srcdoc}
            onLoad={() => {
              // srcdoc loads exactly once; any later load means the guest navigated itself somewhere.
              loads.current += 1;
              if (loads.current > 1) setFailed("navigated away from its sandbox");
              else setLoaded(true);
            }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, pointerEvents: preview ? "none" : "auto" }}
          />
        )}
      </div>
      {!preview && (
        <div className="row" style={{ gap: 6, fontSize: 11, alignItems: "center" }}>
          <span className="badge info">{shell.exe}</span>
          <span className="muted grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Generated shell · sandboxed · {shell.exe}
            {shell.installedBy ? ` · installed by ${shell.installedBy}` : ""}
          </span>
          <button type="button" className="btn sm" onClick={() => setPrefer(app.id, false)}>Use built-in shell</button>
        </div>
      )}
    </div>
  );
}
