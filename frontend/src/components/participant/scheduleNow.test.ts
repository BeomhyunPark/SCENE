import { describe, expect, it } from "vitest";
import { serverNow } from "./participantFeed";
import { initialDay, localDate, nextBoundaryMs, scheduleNowNext } from "./scheduleNow";

const DAYS = [
  { day: 1, date: "2027-01-22", dayLabel: "1월 22일 (금)" },
  { day: 2, date: "2027-01-23", dayLabel: "1월 23일 (토)" },
];

function item(title: string, start: string, end: string | null = null) {
  return { title, startsAt: `${start}+09:00`, endsAt: end ? `${end}+09:00` : null };
}

const at = (local: string) => Date.parse(`${local}+09:00`);

const ITEMS = [
  item("저녁", "2027-01-22T18:00:00", "2027-01-22T19:00:00"),
  item("저녁 집회", "2027-01-22T19:30:00", "2027-01-22T21:30:00"),
  item("조 모임", "2027-01-22T22:00:00", "2027-01-23T00:30:00"),
  item("아침", "2027-01-23T08:00:00"),
  item("오전 집회", "2027-01-23T09:30:00", "2027-01-23T11:00:00"),
];

describe("지금·다음 일정 (§6)", () => {
  it("shows the first item before the event period", () => {
    const result = scheduleNowNext(ITEMS, at("2027-01-21T23:00:00"), DAYS);
    expect(result.phase).toBe("before");
    expect(result.next?.title).toBe("저녁");
  });

  it("has no current item on day 1 before the first start, and the first item next", () => {
    const result = scheduleNowNext(ITEMS, at("2027-01-22T10:00:00"), DAYS);
    expect(result).toMatchObject({ phase: "during", now: null, next: { title: "저녁" } });
  });

  it("counts start as inside and end as outside", () => {
    expect(scheduleNowNext(ITEMS, at("2027-01-22T18:00:00"), DAYS)).toMatchObject({ now: { title: "저녁" }, next: { title: "저녁 집회" } });
    expect(scheduleNowNext(ITEMS, at("2027-01-22T19:00:00"), DAYS)).toMatchObject({ now: null, next: { title: "저녁 집회" } });
  });

  it("keeps an item that ends after midnight running into the next day", () => {
    const result = scheduleNowNext(ITEMS, at("2027-01-23T00:10:00"), DAYS);
    expect(result).toMatchObject({ phase: "during", now: { title: "조 모임" }, next: { title: "아침" } });
  });

  it("lets an item without an end run until the next later start", () => {
    expect(scheduleNowNext(ITEMS, at("2027-01-23T09:00:00"), DAYS).now?.title).toBe("아침");
  });

  it("lets the last item without an end run for 60 minutes", () => {
    const items = [item("마무리", "2027-01-23T12:00:00")];
    expect(scheduleNowNext(items, at("2027-01-23T12:59:00"), DAYS).now?.title).toBe("마무리");
    expect(scheduleNowNext(items, at("2027-01-23T13:00:00"), DAYS).phase).toBe("after");
  });

  it("picks the first in schedule order among items at the same time, and the latest start among overlaps", () => {
    const items = [
      item("본관 집회", "2027-01-22T19:30:00", "2027-01-22T21:00:00"),
      item("별관 집회", "2027-01-22T19:30:00", "2027-01-22T21:00:00"),
      item("기도회", "2027-01-22T20:00:00", "2027-01-22T20:30:00"),
    ];
    expect(scheduleNowNext(items, at("2027-01-22T19:00:00"), DAYS).next?.title).toBe("본관 집회");
    expect(scheduleNowNext(items, at("2027-01-22T19:40:00"), DAYS).now?.title).toBe("본관 집회");
    expect(scheduleNowNext(items, at("2027-01-22T20:10:00"), DAYS).now?.title).toBe("기도회");
  });

  it("says everything is over after the last item", () => {
    expect(scheduleNowNext(ITEMS, at("2027-01-23T12:00:00"), DAYS).phase).toBe("after");
  });

  it("is empty without timed items", () => {
    expect(scheduleNowNext([], at("2027-01-22T12:00:00"), DAYS).phase).toBe("empty");
    expect(scheduleNowNext([{ startsAt: null, endsAt: null }], at("2027-01-22T12:00:00"), DAYS).phase).toBe("empty");
  });

  it("uses the server clock when the phone clock is wrong", () => {
    // The phone is 2 hours behind; the last updates answer measured the offset.
    const phone = at("2027-01-22T16:30:00");
    const corrected = serverNow({ poll: { serverOffsetMs: 2 * 60 * 60 * 1000 } as never }, phone);
    expect(scheduleNowNext(ITEMS, phone, DAYS).now).toBeNull();
    expect(scheduleNowNext(ITEMS, corrected, DAYS).now?.title).toBe("저녁");
  });

  it("wakes at the next start or end", () => {
    expect(nextBoundaryMs(ITEMS, at("2027-01-22T18:30:00"), DAYS)).toBe(at("2027-01-22T19:00:00"));
    expect(nextBoundaryMs(ITEMS, at("2027-01-21T12:00:00"), DAYS)).toBe(at("2027-01-22T00:00:00"));
    expect(nextBoundaryMs(ITEMS, at("2027-01-24T00:00:00"), DAYS)).toBeNull();
  });
});

describe("first day to open", () => {
  it("opens today inside the period in Korea time, whatever the phone's zone", () => {
    // 2027-01-22T15:30Z is 00:30 on the 23rd in Seoul.
    expect(localDate(Date.parse("2027-01-22T15:30:00Z"))).toBe("2027-01-23");
    expect(initialDay(DAYS, Date.parse("2027-01-22T15:30:00Z"))).toBe(2);
  });

  it("opens the first day outside the period", () => {
    expect(initialDay(DAYS, at("2027-02-01T12:00:00"))).toBe(1);
    expect(initialDay([], at("2027-02-01T12:00:00"))).toBeNull();
  });
});
