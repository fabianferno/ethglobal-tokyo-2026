/**
 * Deterministic value extraction. Jev decides WHAT the app is; this only reads the subject of a picture the
 * person asked for ("… with a picture of mt fuji"), so the app can show it. Runs on the client on every keystroke.
 */

export type Params = {
  /** A picture the person asked to see in the app ("with a picture of mt fuji", "draw a cat"). */
  image?: string;
};

export function parse(text: string): Params {
  const image = parseImage(text);
  return image ? { image } : {};
}

// Data words: "draw a chart of rainfall" is a chart, not a picture.
const NOT_A_PICTURE = /\b(chart|graph|table|spreadsheet|sheet|list|ranking|timeline|forecast)\b/;

/** The subject of a requested picture, as the person wrote it. Deterministic: explicit picture words only. */
function parseImage(text: string): string | undefined {
  const t = text.trim();
  const m =
    t.match(/\b(?:an?\s+|the\s+|some\s+)?(?:picture|pic|image|photo|photograph|drawing|illustration|painting|portrait|wallpaper|poster|sketch|artwork)s?\s+of\s+(.+)$/i) ??
    t.match(/\b(?:draw|paint|sketch|illustrate)\s+(?:me\s+)?((?:an?|the|some)\s+.+)$/i) ??
    t.match(/\bwith\s+(?:an?\s+)?(?:picture|pic|image|photo|drawing|illustration)\s*[:-]?\s+(.+)$/i);
  if (!m) return undefined;
  // Stop at the app-plumbing tail: "… on it", "… in it", "… in the background", "… as the background".
  let subject = m[1]
    .replace(/\s+(?:on|in|inside|into)\s+(?:it|the app|the window|there|the background|the corner)\b.*$/i, "")
    .replace(/\s+as\s+(?:the\s+|a\s+)?(?:background|wallpaper|header|cover)\b.*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  // "a picture of tokyo tower and a chart of visitors": the picture ends where the data part of the sentence starts.
  const sep = /\s*(?:,|;|\band\b|\bwith\b|\bplus\b|\bnext to\b|\bbeside\b|\bbut\b)\s*/gi;
  for (const s of subject.matchAll(sep)) {
    const rest = subject.slice(s.index! + s[0].length).split(sep)[0];
    if (NOT_A_PICTURE.test(rest.toLowerCase())) {
      subject = subject.slice(0, s.index).replace(/[\s,;]+$/, "");
      break;
    }
  }
  if (subject.length < 2 || NOT_A_PICTURE.test(subject.toLowerCase())) return undefined;
  return subject.slice(0, 160);
}

export function paramChips(p: Params): string[] {
  return p.image ? [`🖼️ ${p.image.length > 24 ? `${p.image.slice(0, 24)}…` : p.image}`] : [];
}
