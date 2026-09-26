/**
 * Naming scheme: apps (agents) and folders (workspaces) live under the OS's parent name.
 * Users don't get ENS names — a user is just the wallet that owns the names it creates.
 *
 *   suica.eth
 *   ├── grouptab.suica.eth            app
 *   └── team.suica.eth                folder (owns its own namespace)
 *       └── grouptab.team.suica.eth   app inside a folder
 */
export const ROOT = process.env.NEXT_PUBLIC_ENS_ROOT || "suica.eth";

export const cleanLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "") || "app";

export const labelOf = (ens: string) => ens.split(".")[0];

/** First come, first served: if `label.parent` is taken, suggest label-2, label-3, … */
export function uniqueName(label: string, parent: string, taken: (ens: string) => boolean): string {
  const base = cleanLabel(label);
  if (!taken(`${base}.${parent}`)) return `${base}.${parent}`;
  for (let i = 2; i < 1000; i++) if (!taken(`${base}-${i}.${parent}`)) return `${base}-${i}.${parent}`;
  return `${base}-${Date.now().toString(36)}.${parent}`;
}
