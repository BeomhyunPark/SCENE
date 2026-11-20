import type { ScheduleDay } from "../../api/schedule";

/**
 * 지금·다음 일정 (participant-home-contract §6), computed on the phone from the published items and the
 * corrected clock (`serverNow`). Pure functions so the card can recompute on its own timer without
 * calling the server, and tests can pin the clock.
 *
 * - 지금 = start ≤ now < end. An item without an end lasts until the next later start, or start + 60 min.
 *   Several at once: the latest start; same start: the first in schedule order.
 * - 다음 = the earliest start > now; same start: the first in schedule order.
 * - Before the event period: "첫 일정" (the first item). After every item: "일정이 모두 끝났어요".
 */
export type TimedItem = { startsAt: string | null; endsAt: string | null };

export type NowNext<T> =
  | { phase: "empty"; now: null; next: null }
  | { phase: "before"; now: null; next: T }
  | { phase: "during"; now: T | null; next: T | null }
  | { phase: "after"; now: null; next: null };

const HOUR_MS = 60 * 60 * 1000;
/** Asia/Seoul has no daylight saving time; the event's dates start at 00:00 +09:00. */
const KOREA_OFFSET = "+09:00";

type Span<T> = { item: T; index: number; start: number; end: number };

function spansOf<T extends TimedItem>(items: readonly T[]): Span<T>[] {
  const timed = items
    .map((item, index) => ({ item, index, start: item.startsAt ? Date.parse(item.startsAt) : Number.NaN }))
    .filter((entry) => Number.isFinite(entry.start));
  return timed.map((entry) => {
    const explicit = entry.item.endsAt ? Date.parse(entry.item.endsAt) : Number.NaN;
    let end = explicit;
    if (!Number.isFinite(end)) {
      const later = timed.filter((other) => other.start > entry.start).map((other) => other.start);
      end = later.length > 0 ? Math.min(...later) : entry.start + HOUR_MS;
    }
    return { ...entry, end };
  });
}

/** Earliest first; ties keep schedule order. */
function byStart<T>(a: Span<T>, b: Span<T>): number {
  return a.start - b.start || a.index - b.index;
}

export function periodStartMs(days: readonly ScheduleDay[]): number | null {
  const first = days[0]?.date;
  if (!first) return null;
  const at = Date.parse(`${first}T00:00:00${KOREA_OFFSET}`);
  return Number.isFinite(at) ? at : null;
}

export function scheduleNowNext<T extends TimedItem>(items: readonly T[], nowMs: number, days: readonly ScheduleDay[] = []): NowNext<T> {
  const spans = spansOf(items).sort(byStart);
  if (spans.length === 0) return { phase: "empty", now: null, next: null };
  const periodStart = periodStartMs(days) ?? spans[0].start;
  if (nowMs < periodStart) return { phase: "before", now: null, next: spans[0].item };
  const running = spans.filter((span) => span.start <= nowMs && nowMs < span.end);
  const latest = running.length > 0 ? Math.max(...running.map((span) => span.start)) : null;
  const now = latest === null ? null : running.find((span) => span.start === latest)!.item;
  const next = spans.find((span) => span.start > nowMs)?.item ?? null;
  if (!now && !next) return { phase: "after", now: null, next: null };
  return { phase: "during", now, next };
}

/** The next moment the answer can change (a start or an end after now), so the card can wake then. */
export function nextBoundaryMs(items: readonly TimedItem[], nowMs: number, days: readonly ScheduleDay[] = []): number | null {
  const points = spansOf(items).flatMap((span) => [span.start, span.end]);
  const periodStart = periodStartMs(days);
  if (periodStart !== null) points.push(periodStart);
  const future = points.filter((point) => point > nowMs);
  return future.length > 0 ? Math.min(...future) : null;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** "YYYY-MM-DD" of `atMs` in the event's time zone. */
export function localDate(atMs: number, timeZone = "Asia/Seoul"): string {
  let format = dateFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormats.set(timeZone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(atMs)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The day to open first: today when it is inside the event period, else the first day. */
export function initialDay(days: readonly ScheduleDay[], nowMs: number, timeZone = "Asia/Seoul"): number | null {
  if (days.length === 0) return null;
  const today = localDate(nowMs, timeZone);
  return days.find((day) => day.date === today)?.day ?? days[0].day;
}
