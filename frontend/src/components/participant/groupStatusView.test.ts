import { describe, expect, it } from "vitest";
import type { GroupAttendance, LeaderView, LeaderViewMember } from "../../api/participantGroup";
import { koreaDate, lodgingText, memberSpan, slotCounts, spanText, todayMovements } from "./groupStatusView";

const SLOTS = [
  ["s1", 1, "2027-01-22", "1월 22일 (금)", "저녁"],
  ["s2", 1, "2027-01-22", "1월 22일 (금)", "집회"],
  ["s3", 2, "2027-01-23", "1월 23일 (토)", "아침"],
  ["s4", 2, "2027-01-23", "1월 23일 (토)", "저녁"],
  ["s5", 3, "2027-01-24", "1월 24일 (일)", "점심"],
].map(([slotId, day, date, dayLabel, label], sortOrder) => ({
  slotId: String(slotId),
  day: Number(day),
  date: String(date),
  dayLabel: String(dayLabel),
  meal: "X",
  label: String(label),
  sortOrder,
}));

function attendance(slotIds: string[] | null, extra: Partial<GroupAttendance> = {}): GroupAttendance {
  return { type: "PARTIAL", arrivalSlotId: null, departureSlotId: null, slotIds, lodgingNights: null, ...extra };
}

function member(id: string, slotIds: string[] | null, extra: Partial<GroupAttendance> = {}): LeaderViewMember {
  return {
    participantId: id,
    name: id,
    cohort: null,
    gender: null,
    leader: false,
    checkIn: { checkedIn: false, checkedInAt: null },
    attendance: attendance(slotIds, extra),
    room: null,
    applicationRevisedAt: null,
  };
}

function view(members: LeaderViewMember[]): LeaderView {
  return { activeCount: members.length, checkedInCount: 0, slots: SLOTS, members };
}

describe("조원 현황 counts (F3)", () => {
  it("takes the Korea date of the clock", () => {
    expect(koreaDate(Date.parse("2027-01-22T14:59:00Z"))).toBe("2027-01-22");
    expect(koreaDate(Date.parse("2027-01-22T15:00:00Z"))).toBe("2027-01-23");
  });

  it("uses the server's arrival and departure slots before the first and last attended ones", () => {
    expect(memberSpan(attendance(["s2", "s3", "s4"]), SLOTS)).toMatchObject({ arrival: { slotId: "s2" }, departure: { slotId: "s4" } });
    expect(memberSpan(attendance(["s3", "s4"], { arrivalSlotId: "s3", departureSlotId: "s5" }), SLOTS)).toMatchObject({
      departure: { slotId: "s5" },
    });
    expect(memberSpan(attendance(null), SLOTS)).toBeNull();
    expect(memberSpan(attendance(["s1"]), null)).toBeNull();
    expect(spanText(attendance(["s4"]), SLOTS)).toBe("1월 23일 (토) 저녁");
  });

  it("lists who comes and goes today and leaves unknown slots out", () => {
    const today = todayMovements(view([member("a", ["s1", "s2", "s3", "s4", "s5"]), member("b", ["s4", "s5"]), member("c", ["s2", "s3"]), member("d", null)]), "2027-01-23");
    if (!today.inEvent) throw new Error("in event");
    expect(today.dayLabel).toBe("1월 23일 (토)");
    expect(today.coming.map((item) => [item.member.participantId, item.slot.label])).toEqual([["b", "저녁"]]);
    expect(today.going.map((item) => [item.member.participantId, item.slot.label])).toEqual([["c", "아침"]]);
    expect(today.unknown.map((item) => item.participantId)).toEqual(["d"]);
    expect(todayMovements(view([member("a", ["s1"])]), "2026-12-24")).toEqual({ inEvent: false });
  });

  it("counts members per slot by day", () => {
    const counts = slotCounts(view([member("a", ["s1", "s2", "s3"]), member("b", ["s2"]), member("c", null)]));
    expect(counts.unknown).toBe(1);
    expect(counts.days.map((day) => [day.dayLabel, day.slots.map((item) => item.count)])).toEqual([
      ["1월 22일 (금)", [1, 2]],
      ["1월 23일 (토)", [1, 0]],
      ["1월 24일 (일)", [0]],
    ]);
  });

  it("names the nights", () => {
    expect(lodgingText(null)).toBe("모름");
    expect(lodgingText([])).toBe("숙박 안 함");
    expect(lodgingText([1, 2])).toBe("1일째·2일째 밤");
  });
});
