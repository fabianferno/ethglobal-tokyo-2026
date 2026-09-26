/** Shared query parsing for /api/defi/* routes. */
export function symbolParam(url: URL, key: string, fallback: string): string | null {
  const v = (url.searchParams.get(key) ?? fallback).trim().toUpperCase();
  return /^[A-Z0-9]{2,12}$/.test(v) ? v : null;
}
export function chainList(url: URL): string[] {
  return (url.searchParams.get("chains") ?? "").split(",").map((c) => c.trim()).filter((c) => /^[A-Za-z0-9 ]{2,24}$/.test(c)).slice(0, 8);
}
export function projectList(url: URL): string[] {
  return (url.searchParams.get("projects") ?? "").split(",").map((c) => c.trim().toLowerCase()).filter((c) => /^[a-z0-9-]{2,24}$/.test(c)).slice(0, 8);
}
