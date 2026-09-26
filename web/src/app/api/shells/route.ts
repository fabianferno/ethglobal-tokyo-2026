import { after } from "next/server";
import { z } from "zod";
import { shellLabel } from "@/lib/genshell/detect";
import { canPublish, generateShell, hasGenerator, listShells, publishShell, shellHtml } from "@/lib/genshell/server";
import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;

const labelRe = /^[a-z0-9-]{1,32}$/;

/** GET → installed shells. GET ?label=x → that shell's HTML (local cache or Walrus via ENS, hash-checked). */
export async function GET(request: Request) {
  const label = new URL(request.url).searchParams.get("label");
  try {
    if (label) {
      if (!labelRe.test(label)) return Response.json({ error: "bad label" }, { status: 400 });
      const html = await shellHtml(label);
      return html ? Response.json({ label, html }) : Response.json({ error: "not installed" }, { status: 404 });
    }
    return Response.json({ shells: await listShells(), generator: hasGenerator() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

const body = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("generate"),
    name: z.string().min(2).max(40),
    prompt: z.string().max(300),
    sample: z.unknown(),
    installedBy: z.string().max(80),
    retryError: z.string().max(500).optional(),
  }),
  z.object({ op: z.literal("publish"), label: z.string().regex(labelRe), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
]);

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const b = parsed.data;

  if (b.op === "publish") {
    const rl = rateLimit(`genshell-publish:${clientKey(request)}`, 10, 10 * 60_000);
    if (!rl.ok) return tooMany(rl.retryAfterMs);
    // The caller must name the exact build it smoke-tested; the server re-runs the static checks.
    const bad = await canPublish(b.label, b.sha256);
    if (bad) return Response.json({ error: bad }, { status: 409 });
    // Walrus + ENS take ~30–60 s: answer now, publish after the response.
    after(() => publishShell(b.label).catch((e) => console.warn("[genshell] publish failed", b.label, (e as Error).message)));
    return Response.json({ ok: true, label: b.label }, { status: 202 });
  }

  if (!hasGenerator()) return Response.json({ error: "shell generator not configured (AI_GATEWAY_API_KEY)" }, { status: 503 });
  const rl = rateLimit(`genshell:${clientKey(request)}`, 8, 10 * 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);
  // Paid generations: a global budget no header can reset.
  const budget = rateLimit("genshell:global", Number(process.env.GENSHELL_MAX_PER_HOUR || 30), 60 * 60_000);
  if (!budget.ok) return tooMany(budget.retryAfterMs);
  try {
    const shell = await generateShell({ name: b.name, prompt: b.prompt, sample: b.sample, installedBy: b.installedBy, retryError: b.retryError });
    return Response.json({ shell });
  } catch (e) {
    const check = (e as { check?: string }).check;
    return Response.json({ error: (e as Error).message, check, label: shellLabel(b.name) }, { status: check ? 422 : 502 });
  }
}
