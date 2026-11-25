/**
 * 시간표 배치 (#466). Pure functions shared by the operator 일정표 and the participant 일정 tab, so the
 * layout, the current-time line and 지난·지금 judgement can be tested without a browser.
 *
 * Minutes count from 00:00 of the item's own day in the event time zone; an item that ends the next day
 * ends past 1440. Times are the local `HH:mm` values the server sends, never re-zoned.
 */

export const DAY_MINUTES = 24 * 60;
/** An item without an end lasts until the next later start, at most this long on screen. */
export const OPEN_END_MINUTES = 60;
/** Short items still get room for one line of time and title; lanes use the same length so they never cover each other. */
export const MIN_BLOCK_MINUTES = 30;
/** Empty stretches at least this long (after rounding to hours) fold into a short break. */
export const FOLD_MINUTES = 120;
/** How tall a folded stretch is, in axis minutes. */
export const FOLD_HEIGHT = 24;
/** A label and a grid line every hour, as in the SCENE 시간표 frame (172:3). */
export const TICK_MINUTES = 60;
/** Every day shows at least 07:00–24:00, like a calendar app, so an empty day is still a timetable to add to. */
export const BASE_RANGE: [number, number] = [7 * 60, 24 * 60];
/** A tap or drag on free time snaps to this many minutes. */
export const PICK_STEP = 15;

export type TimedRow = { startTime: string; endTime: string | null; endsNextDay: boolean };

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "HH:mm" for a minute count, wrapping past midnight (25:00 → "01:00"). */
export function clockOf(minute: number): string {
  const wrapped = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export type Span = { start: number; end: number | null };

/** Start and end in day minutes. The end is null when the item has none. */
export function spanOf(row: TimedRow): Span {
  const start = minutesOf(row.startTime);
  if (!row.endTime) return { start, end: null };
  let end = minutesOf(row.endTime) + (row.endsNextDay ? DAY_MINUTES : 0);
  if (end < start) end += DAY_MINUTES;
  return { start, end };
}

export type Placed<T> = {
  row: T;
  start: number;
  /** Where the block ends on screen (an open end is cut at the next start or one hour). */
  end: number;
  /** The real end, or null when the item has none. */
  realEnd: number | null;
  lane: number;
  lanes: number;
};

/**
 * Blocks for one day, side by side where they overlap (like a calendar app): each item takes the first
 * free lane, and every item in a cluster of overlapping items shares the cluster's lane count.
 */
export function placeDay<T extends TimedRow>(rows: readonly T[]): Placed<T>[] {
  const spans = rows.map((row, index) => ({ row, index, ...spanOf(row) }));
  const starts = spans.map((span) => span.start);
  const blocks = spans
    .map((span) => {
      let end = span.end;
      if (end === null) {
        const later = starts.filter((start) => start > span.start);
        end = Math.min(span.start + OPEN_END_MINUTES, ...later);
      }
      return { row: span.row, index: span.index, start: span.start, end, realEnd: span.end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);

  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    for (const block of cluster) block.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const block of blocks) {
    const shown = Math.max(block.end, block.start + MIN_BLOCK_MINUTES);
    if (block.start >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= block.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(shown);
    } else {
      laneEnds[lane] = shown;
    }
    clusterEnd = Math.max(clusterEnd === -Infinity ? shown : clusterEnd, shown);
    const entry: Placed<T> = { row: block.row, start: block.start, end: block.end, realEnd: block.realEnd, lane, lanes: 1 };
    cluster.push(entry);
    placed.push(entry);
  }
  close();
  return placed;
}

export type AxisPart = { kind: "time"; from: number; to: number; top: number } | { kind: "fold"; from: number; to: number; top: number };

export type Axis = {
  parts: AxisPart[];
  /** Total height in axis minutes. */
  height: number;
  /** Hours to label, with their position. */
  ticks: { minute: number; top: number }[];
};

/**
 * One axis for the given stretches (each item's block, and the current time when it is shown). Stretches
 * are widened to whole hours; empty stretches of two hours or more fold into a short break so a night
 * between the last and first items does not fill the screen.
 */
export function buildAxis(stretches: readonly [number, number][]): Axis {
  if (stretches.length === 0) return { parts: [], height: 0, ticks: [] };
  const hours = stretches
    .map(([from, to]) => [Math.floor(from / 60) * 60, Math.max(Math.ceil(to / 60) * 60, Math.floor(from / 60) * 60 + 60)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of hours) {
    const last = merged[merged.length - 1];
    if (last && from - last[1] < FOLD_MINUTES) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  const parts: AxisPart[] = [];
  const ticks: Axis["ticks"] = [];
  let top = 0;
  merged.forEach(([from, to], index) => {
    if (index > 0) {
      const gapFrom = merged[index - 1][1];
      parts.push({ kind: "fold", from: gapFrom, to: from, top });
      top += FOLD_HEIGHT;
    }
    parts.push({ kind: "time", from, to, top });
    for (let minute = from; minute <= to; minute += TICK_MINUTES) {
      // The hour at a fold's lower edge is labelled once, by the part below it.
      if (minute === to && index < merged.length - 1) continue;
      ticks.push({ minute, top: top + (minute - from) });
    }
    top += to - from;
  });
  return { parts, height: top, ticks };
}

/** Position of a day minute on the axis, in axis minutes. Inside a fold it moves proportionally. */
export function axisTop(axis: Axis, minute: number): number {
  for (const part of axis.parts) {
    if (minute < part.from) return part.top;
    if (minute <= part.to) {
      if (part.kind === "time") return part.top + (minute - part.from);
      return part.top + ((minute - part.from) / (part.to - part.from)) * FOLD_HEIGHT;
    }
  }
  return axis.height;
}

/** The day minute at a position on the axis (the inverse of axisTop). Inside a fold it is the fold's end. */
export function minuteAt(axis: Axis, top: number): number {
  for (const part of axis.parts) {
    const bottom = part.top + (part.kind === "time" ? part.to - part.from : FOLD_HEIGHT);
    if (top < bottom || part === axis.parts[axis.parts.length - 1]) {
      if (part.kind === "fold") return part.to;
      return Math.min(Math.max(part.from + (top - part.top), part.from), part.to);
    }
  }
  return 0;
}

/**
 * The span a tap or drag on free time picks: snapped to 15 minutes, start before end. A tap (no drag) is
 * 30 minutes from where it landed.
 */
export function pickedSpan(fromMinute: number, toMinute: number | null): { start: number; end: number } {
  const snap = (minute: number) => Math.floor(minute / PICK_STEP) * PICK_STEP;
  const a = snap(fromMinute);
  if (toMinute === null) return { start: a, end: a + 30 };
  const b = snap(toMinute);
  const start = Math.min(a, b);
  const end = Math.max(a, b) + PICK_STEP;
  return { start, end };
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** The event-local date ("YYYY-MM-DD") and minute of the day at `atMs`, whatever the browser's own zone. */
export function zonedClock(atMs: number, timeZone = "Asia/Seoul"): { date: string; minute: number } {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clockFormats.set(timeZone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(atMs)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / (DAY_MINUTES * 60_000));
}

/**
 * Now as a minute of the given event day: negative before it, past 1440 after midnight. Comparing an
 * item's day minutes with this says whether it is over, on any day.
 */
export function nowOnDay(date: string, nowMs: number, timeZone = "Asia/Seoul"): number {
  const clock = zonedClock(nowMs, timeZone);
  return (dayNumber(clock.date) - dayNumber(date)) * DAY_MINUTES + clock.minute;
}

/**
 * Where the current-time line goes on a day's column, or null for no line. The line is on today's
 * column; just after midnight it is also on yesterday's while one of yesterday's items still runs.
 */
export function nowLineMinute(date: string, rows: readonly TimedRow[], nowMs: number, timeZone = "Asia/Seoul"): number | null {
  const minute = nowOnDay(date, nowMs, timeZone);
  if (minute >= 0 && minute < DAY_MINUTES) return minute;
  if (minute >= DAY_MINUTES && minute < 2 * DAY_MINUTES) {
    const running = rows.some((row) => {
      const span = spanOf(row);
      return span.end !== null && span.end > minute;
    });
    return running ? minute : null;
  }
  return null;
}

/** Over when its block has ended by now (an open end counts its on-screen end). */
export function isPast(block: { end: number }, nowMinute: number): boolean {
  return block.end <= nowMinute;
}
