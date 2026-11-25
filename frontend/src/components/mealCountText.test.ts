import { describe, expect, it } from "vitest";
import type { MealCounts, MealCountSlot } from "../api/mealCounts";
import { asOfLabel, kitchenText, mealLine, remainingLines } from "./mealCountText";

const slot = (slotId: string, label: string, planned: number, missing: number): MealCountSlot => ({
  slotId,
  meal: "DINNER",
  label,
  startTime: "18:00",
  timeFromSchedule: false,
  passed: false,
  planned,
  arrived: 0,
  coming: planned - missing,
  missing,
  reflected: planned - missing,
});

const data: MealCounts = {
  eventStatus: "ACTIVE",
  asOf: "2027-01-22T05:05:00Z",
  nextSlotId: "opt_d1_dinner",
  submitted: 62,
  checkedIn: 0,
  unknown: { count: 2, arrived: 1 },
  days: [
    { day: 1, date: "2027-01-22", label: "1월 22일 (금)", slots: [slot("opt_d1_lunch", "점심", 10, 0), slot("opt_d1_dinner", "저녁", 60, 8)] },
    { day: 2, date: "2027-01-23", label: "1월 23일 (토)", slots: [slot("opt_d2_breakfast", "아침", 1200, 0)] },
  ],
};

describe("kitchen text", () => {
  it("puts the reflected count first and names who is left out", () => {
    expect(mealLine({ dayLabel: "1월 22일 (금)", slot: data.days[0].slots[1] })).toBe(
      "1월 22일 (금) 저녁 52명 (신청 60명, 아직 안 온 8명 제외)",
    );
    expect(mealLine({ dayLabel: "1월 23일 (토)", slot: data.days[1].slots[0] })).toBe("1월 23일 (토) 아침 1,200명");
  });

  it("starts at the next meal, with a heading in the event zone and a note for unknown meals", () => {
    expect(remainingLines(data).map((line) => line.slot.slotId)).toEqual(["opt_d1_dinner", "opt_d2_breakfast"]);
    expect(kitchenText("겨울 수련회", data, remainingLines(data)).split("\n")).toEqual([
      "[겨울 수련회] 식수 (1/22 14:05 기준)",
      "1월 22일 (금) 저녁 52명 (신청 60명, 아직 안 온 8명 제외)",
      "1월 23일 (토) 아침 1,200명",
      "끼니를 모르는 신청 2명은 빠져 있어요.",
    ]);
    expect(remainingLines({ ...data, nextSlotId: null })).toEqual([]);
    expect(asOfLabel("2027-01-21T15:30:00Z")).toBe("1/22 00:30");
  });
});
