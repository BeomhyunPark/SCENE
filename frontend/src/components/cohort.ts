/**
 * 또래 order. 또래 is usually the last two digits of the birth year as text, so plain text or number order
 * puts "00" before "88". Read a two-digit value as 19xx when it is above this year's last two digits and as
 * 20xx otherwise (2026: "27"–"99" → 1927–1999, "00"–"26" → 2000–2026): 88, 89 … 99, 00, 01. A four-digit
 * value is a year as written. Anything else sorts after the years, by text. Only the screen orders this
 * way; server responses keep their order.
 */
export function cohortYear(value: string, now: Date = new Date()): number | null {
  const text = value.trim();
  if (/^\d{4}$/.test(text)) return Number(text);
  if (!/^\d{2}$/.test(text)) return null;
  const twoDigits = Number(text);
  return twoDigits > now.getFullYear() % 100 ? 1900 + twoDigits : 2000 + twoDigits;
}

export function compareCohort(a: string, b: string, now: Date = new Date()): number {
  const left = cohortYear(a, now);
  const right = cohortYear(b, now);
  if (left !== null && right !== null) return left - right || a.localeCompare(b, "ko");
  if (left !== null) return -1;
  if (right !== null) return 1;
  return a.localeCompare(b, "ko", { numeric: true });
}

/**
 * A text key that sorts like compareCohort under a plain or numeric text comparison: "a" + year, then
 * "b" + other text. A caller can put "c" after both for "no 또래".
 */
export function cohortSortKey(value: string, now: Date = new Date()): string {
  const year = cohortYear(value, now);
  return year !== null ? `a${String(year).padStart(4, "0")}` : `b${value.trim()}`;
}
