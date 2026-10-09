import type { SystemKey } from "./store";

/**
 * Start-menu rules that sit on top of Jev's answers: which system apps a query names, and when to show
 * "cannot find .exe". Pure, so it can be tested without the UI.
 */

const SYSTEM_ROUTES: { re: RegExp; key: SystemKey; label: string }[] = [
  { re: /\b(task manager|taskmgr|running apps|processes)\b/, key: "taskmgr", label: "Task Manager" },
  { re: /\b(my computer|about (jev( os)?|this computer)|system info)\b/, key: "mycomputer", label: "About Jev OS" },
  { re: /\b(ui kit|design system)\b/, key: "kit", label: "Windows 98 UI Kit" },
];

/** OS actions reachable from search (not apps). */
export type ActionKey = "welcome";
const ACTION_ROUTES: { re: RegExp; key: ActionKey; label: string }[] = [
  { re: /\b(what is (this|jev( os)?)|how does (this|it|jev( os)?) work|how do i use (this|it)|welcome|tour|getting started|get started)\b/, key: "welcome", label: "Welcome to Jev OS" },
];

export function actionHits(q: string): { key: ActionKey; label: string }[] {
  const t = q.toLowerCase();
  return ACTION_ROUTES.filter((r) => r.re.test(t)).map(({ key, label }) => ({ key, label }));
}

export function systemHits(q: string): { key: SystemKey; label: string }[] {
  const t = q.toLowerCase();
  return SYSTEM_ROUTES.filter((r) => r.re.test(t)).map(({ key, label }) => ({ key, label }));
}

/** Show "Windows cannot find 'x.exe'"? When Jev thinks the text isn't a request for an app, and no system app matched. */
export function showNotFound(opts: { nonsense: number; systems: number }): boolean {
  return !opts.systems && opts.nonsense > 0.6;
}
