/**
 * Notice bodies are plain text (DEC-082 §1). Only `http://` and `https://` addresses become links,
 * opened in a new window without an opener; everything else — tags, `javascript:` — stays text.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
/** Punctuation that usually ends a sentence rather than the address. */
const TRAILING = /[.,!?;:)\]}'"’”。、]+$/;

export type TextPart = { kind: "text"; value: string } | { kind: "link"; value: string };

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trailing = TRAILING.exec(url)?.[0] ?? "";
    url = url.slice(0, url.length - trailing.length);
    if (!isWebUrl(url)) continue;
    if (start > last) parts.push({ kind: "text", value: text.slice(last, start) });
    parts.push({ kind: "link", value: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}
