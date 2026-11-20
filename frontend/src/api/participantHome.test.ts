import { describe, expect, it } from "vitest";
import { parseHome, parseUpdates } from "./participantHome";

const EVENT = { eventId: "e", name: "수련회", status: "ACTIVE", startDate: null, endDate: null, place: null, timeZone: "Asia/Seoul" };

describe("participant home response", () => {
  it.each([
    [{ completionNotice: "참가비 3만원" }, "참가비 3만원"],
    [{ completionNotice: "  " }, null],
    [{ completionNotice: null }, null],
    [{}, null],
  ])("reads the completion notice as a string (%j)", (extra, text) => {
    expect(parseHome({ event: EVENT, ...extra }).completionNotice).toBe(text);
  });

  it("turns a missing or unknown area off and keeps the home without updates", () => {
    const home = parseHome({ event: EVENT, features: { schedule: true, groups: "yes", future: true } });
    expect(home.features).toEqual({ schedule: true, notices: false, groups: false, rooms: false, mealOrder: false });
    expect(home.updates).toBeNull();
  });

  it("keeps pollAfterSeconds within 10–300 and drops unknown keys", () => {
    expect(parseUpdates({ pollAfterSeconds: 1 })?.pollAfterSeconds).toBe(10);
    expect(parseUpdates({ pollAfterSeconds: 9000 })?.pollAfterSeconds).toBe(300);
    expect(parseUpdates({})?.pollAfterSeconds).toBe(30);
    expect(parseUpdates({ home: 2, somethingNew: 4, group: "x" })?.versions).toEqual({ home: 2 });
  });
});
