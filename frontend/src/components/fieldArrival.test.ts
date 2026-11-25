import { describe, expect, it } from "vitest";
import { arrivalBasis, arrivalLine, slotText } from "./fieldArrival";

const dinner2 = { slotId: "opt_d2_dinner", day: 2, dayLabel: "1월 23일 (토)", label: "저녁" };

describe("fieldArrival", () => {
  it("names the due slot by day and meal", () => {
    expect(slotText(dinner2)).toBe("2일차 저녁");
  });

  it("tells overdue, coming, passed and unknown apart", () => {
    expect(arrivalLine({ status: "OVERDUE", slot: dinner2 })).toEqual({ text: "2일차 저녁 도착 예정 · 왔어야 함", tone: "overdue" });
    expect(arrivalLine({ status: "COMING", slot: dinner2 })).toEqual({ text: "2일차 저녁 도착 예정 · 올 예정", tone: "coming" });
    expect(arrivalLine({ status: "PASSED", slot: dinner2 })?.text).toBe("2일차 저녁 도착 예정 · 참석 칸 지남");
    expect(arrivalLine({ status: "PASSED", slot: null })?.text).toBe("참석 칸 없음");
    expect(arrivalLine({ status: "UNKNOWN", slot: null })?.text).toBe("도착 예정 모름");
    expect(arrivalLine({ status: "ARRIVED", slot: dinner2 })?.text).toBe("2일차 저녁 도착 예정");
    expect(arrivalLine(null)).toBeNull();
  });

  it("names the next meal the summary counts against", () => {
    const counts = { asOf: "2027-01-23T05:00:00Z", overdue: 1, coming: 2, passed: 0, unknown: 0 };
    expect(arrivalBasis({ ...counts, nextMeal: dinner2 })).toBe("다음 끼니 2일차 저녁 기준");
    expect(arrivalBasis({ ...counts, nextMeal: null })).toBe("모든 끼니가 지났어요");
  });
});
