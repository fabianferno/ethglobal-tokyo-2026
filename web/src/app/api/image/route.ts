import { clientKey, rateLimit, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A picture inside an app ("paint app with a picture of mt fuji"): GET /api/image?q=mt+fuji&style=paint → image bytes.
 * Gemini only (GEMINI_API_KEY, cheapest flash image model; override with GEMINI_IMAGE_MODEL). No fallback: if Gemini
 * fails the app says so. Responses are immutable per URL, so the CDN and browser cache each picture after the first request:
 * one generation per unique prompt, which keeps it cheap. The prompt is the person's own words; nothing here is
 * data, and nothing here can move money.
 */

const STYLES: Record<string, string> = {
  paint: "drawn in MS Paint on Windows 98: flat colours, thick mouse-drawn outlines, a little clumsy, white background",
  pixel: "16-bit pixel art, limited palette",
  photo: "a clear photograph",
  default: "a clean, colourful illustration, retro 1998 computer clip-art feel",
};

const memo = new Map<string, Promise<{ bytes: Buffer; type: string; source: string }>>();

async function gemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no GEMINI_API_KEY");
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
    signal: AbortSignal.timeout(40_000),
  });
  const j = (await r.json()) as { error?: { message: string }; candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
  if (!r.ok) throw new Error(`gemini ${r.status}: ${j.error?.message?.slice(0, 120)}`);
  const img = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!img) throw new Error("gemini returned no image (possibly blocked by its safety filter)");
  return { bytes: Buffer.from(img.data, "base64"), type: img.mimeType, source: `gemini:${model}` };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const style = STYLES[url.searchParams.get("style") ?? ""] ?? STYLES.default;
  if (q.length < 2) return Response.json({ error: "expected ?q=<what to draw>" }, { status: 400 });
  const prompt = `${q}. Style: ${style}. No text, no watermark, no borders.`;
  const key = prompt.toLowerCase();

  let job = memo.get(key);
  if (!job) {
    const rl = rateLimit(`image:${clientKey(request)}`, 12, 60_000);
    if (!rl.ok) return tooMany(rl.retryAfterMs);
    job = gemini(prompt);
    if (memo.size > 200) memo.clear();
    memo.set(key, job);
    job.catch(() => memo.delete(key));
  }
  try {
    const { bytes, type, source } = await job;
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable", "x-image-source": source },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
