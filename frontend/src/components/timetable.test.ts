import { describe, expect, it } from "vitest";
import { axisTop, buildAxis, minuteAt, pickedSpan, clockOf, FOLD_HEIGHT, isPast, nowLineMinute, nowOnDay, placeDay, spanOf, zonedClock } from "./timetable";

function row(startTime: string, endTime: string | null = null, endsNextDay = false) {
  return { startTime, endTime, endsNextDay };
}

describe("timetable spans", () => {
  it("reads local times, overnight ends and open ends", () => {
    expect(spanOf(row("09:30", "11:00"))).toEqual({ start: 570, end: 660 });
    expect(spanOf(row("22:00", "00:30", true))).toEqual({ start: 1320, end: 1470 });
    expect(spanOf(row("14:00"))).toEqual({ start: 840, end: null });
    expect(clockOf(1470)).toBe("00:30");
  });

  it("cuts an open end at the next start, or one hour", () => {
    const [first, second] = placeDay([row("14:00"), row("14:20", "15:00")]);
    expect(first).toMatchObject({ start: 840, end: 860, realEnd: null });
    expect(second).toMatchObject({ start: 860, end: 900 });
    expect(placeDay([row("20:00")])[0]).toMatchObject({ end: 1260 });
  });

  it("puts overlapping items side by side and gives short items room of their own", () => {
    const placed = placeDay([row("09:00", "11:00"), row("09:30", "10:00"), row("10:00", "10:10"), row("12:00", "13:00")]);
    const lanes = Object.fromEntries(placed.map((entry) => [entry.row.startTime, [entry.lane, entry.lanes]]));
    expect(lanes["09:00"]).toEqual([0, 2]);
    expect(lanes["09:30"]).toEqual([1, 2]);
    // 10:00–10:10 is drawn 30 minutes tall, so it can follow 09:30–10:00 in the same lane.
    expect(lanes["10:00"]).toEqual([1, 2]);
    expect(lanes["12:00"]).toEqual([0, 1]);
  });
});

describe("timetable axis", () => {
  it("labels hours and folds a long empty stretch", () => {
    const axis = buildAxis([
      [480, 540],
      [1320, 1470],
    ]);
    expect(axis.parts.map((part) => [part.kind, part.from, part.to])).toEqual([
      ["time", 480, 540],
      ["fold", 540, 1320],
      ["time", 1320, 1500],
    ]);
    expect(axis.height).toBe(60 + FOLD_HEIGHT + 180);
    expect(axis.ticks.map((tick) => clockOf(tick.minute))).toEqual(["08:00", "22:00", "23:00", "00:00", "01:00"]);
    expect(axisTop(axis, 1320)).toBe(60 + FOLD_HEIGHT);
    expect(axisTop(axis, 930)).toBeCloseTo(60 + FOLD_HEIGHT / 2);
  });

  it("keeps a short gap", () => {
    const axis = buildAxis([
      [540, 600],
      [660, 720],
    ]);
    expect(axis.parts).toHaveLength(1);
    expect(axis.height).toBe(180);
  });
});

describe("current time in the event time zone", () => {
  // 2027-01-22 05:30 UTC is 14:30 in Seoul and 21:30 the day before in Los Angeles.
  const at = Date.parse("2027-01-22T05:30:00Z");

  it("reads the event's own zone, not the browser's", () => {
    expect(zonedClock(at, "Asia/Seoul")).toEqual({ date: "2027-01-22", minute: 870 });
    expect(zonedClock(at, "America/Los_Angeles")).toEqual({ date: "2027-01-21", minute: 1290 });
  });

  it("puts the line on today's column only", () => {
    expect(nowLineMinute("2027-01-22", [], at, "Asia/Seoul")).toBe(870);
    expect(nowLineMinute("2027-01-23", [], at, "Asia/Seoul")).toBeNull();
    expect(nowLineMinute("2027-01-21", [], at, "Asia/Seoul")).toBeNull();
  });

  it("keeps the line on yesterday's column while an overnight item runs", () => {
    const afterMidnight = Date.parse("2027-01-22T15:15:00Z"); // 00:15 on the 23rd in Seoul
    expect(nowLineMinute("2027-01-22", [row("22:00", "00:30", true)], afterMidnight, "Asia/Seoul")).toBe(1455);
    expect(nowLineMinute("2027-01-22", [row("20:00", "22:00")], afterMidnight, "Asia/Seoul")).toBeNull();
    expect(nowLineMinute("2027-01-23", [], afterMidnight, "Asia/Seoul")).toBe(15);
  });

  it("says which items are over on any day", () => {
    expect(nowOnDay("2027-01-21", at, "Asia/Seoul")).toBe(1440 + 870);
    expect(nowOnDay("2027-01-23", at, "Asia/Seoul")).toBe(870 - 1440);
    const [morning, afternoon] = placeDay([row("09:00", "10:00"), row("14:00", "15:00")]);
    expect(isPast(morning, 870)).toBe(true);
    expect(isPast(afternoon, 870)).toBe(false);
  });
});

describe("picking free time", () => {
  it("maps a position back to a minute, and a fold to its end", () => {
    const axis = buildAxis([
      [420, 600],
      [1320, 1440],
    ]);
    expect(minuteAt(axis, 0)).toBe(420);
    expect(minuteAt(axis, 95)).toBe(515);
    expect(minuteAt(axis, 180 + 5)).toBe(1320);
    expect(minuteAt(axis, 180 + FOLD_HEIGHT + 30)).toBe(1350);
  });

  it("snaps a tap to 30 minutes and a drag to 15-minute steps either way", () => {
    expect(pickedSpan(607, null)).toEqual({ start: 600, end: 630 });
    expect(pickedSpan(600, 668)).toEqual({ start: 600, end: 675 });
    expect(pickedSpan(668, 600)).toEqual({ start: 600, end: 675 });
  });
});
