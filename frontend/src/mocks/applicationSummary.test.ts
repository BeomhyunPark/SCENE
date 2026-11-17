import { describe, expect, it } from "vitest";
import { localUsers } from "./fixtures/seed";
import { applicationSummary } from "./applicationSummary";
import { updateField } from "./formStore";
import { RETREAT, seedFourApplicants, seedRetreat } from "../test/summarySeed";

const OWNER = localUsers[0].userId;
const counts = (options: { optionId: string; count: number }[] | undefined) =>
  Object.fromEntries((options ?? []).map((option) => [option.optionId, option.count]));

describe("mock application summary (server rules, DEC-073)", () => {
  it("counts every area the way ApplicationSummaryService does", () => {
    const { ids } = seedFourApplicants();
    const summary = applicationSummary(RETREAT);

    expect(summary.fromSetup).toBe(true);
    expect(summary.total).toBe(4);
    expect(summary.attendance).toEqual({ asked: true, full: 1, partial: 2, worshipOnly: 1 });
    expect(counts(summary.gender?.options)).toEqual({ opt_female: 2, opt_male: 1 });
    expect(summary.gender?.noAnswer).toBe(1);
    expect(summary.cohorts).toEqual({
      items: [
        { cohort: "00", count: 1 },
        { cohort: "94", count: 1 },
        { cohort: "95", count: 1 },
      ],
      noAnswer: 1,
    });

    // Full attendee in every cell, choosers only where they chose; 라온 has no meal answer.
    const meals = summary.meals!;
    expect(meals.days.map((day) => [day.day, day.date, day.label])).toEqual([
      [1, "2027-01-22", "1월 22일 (금)"],
      [2, "2027-01-23", "1월 23일 (토)"],
      [3, "2027-01-24", "1월 24일 (일)"],
    ]);
    expect(meals.days[0].slots.map((slot) => [slot.meal, slot.count])).toEqual([
      ["DINNER", 2],
      ["WORSHIP", 1],
    ]);
    expect(meals.days[1].slots.find((slot) => slot.meal === "WORSHIP")?.count).toBe(2);
    expect(meals.unanswered).toBe(1);

    expect(summary.lodging?.nights.map((night) => [night.label, night.count])).toEqual([
      ["첫째 밤 (1월 22일 (금))", 2],
      ["둘째 밤 (1월 23일 (토))", 1],
    ]);
    expect(summary.lodging?.unanswered).toBe(0);

    // The driver there counts as a driver back.
    expect(counts(summary.transport?.in.options)).toMatchObject({ opt_group: 1, opt_shuttle: 1, opt_car: 1, opt_support: 1 });
    expect(counts(summary.transport?.out.options)).toMatchObject({ opt_group: 1, opt_shuttle: 1, opt_car: 1, opt_support: 1 });
    expect(summary.transport?.out.noAnswer).toBe(0);
    expect(counts(summary.shuttle?.in?.options)).toEqual({ opt_d1: 1, opt_d2: 1 });
    expect(counts(summary.shuttle?.out?.options)).toEqual({ opt_d1: 0, opt_d2: 1 });

    expect(summary.carpool).toEqual({
      offerCount: 1,
      seatTotal: 3,
      offers: [{ applicationId: ids.driver, name: "나래", cohort: "95", seats: 3, area: "분당", note: "판교 경유 가능" }],
    });
    expect(summary.mobility).toEqual({
      in: [{ applicationId: ids.rider, name: "라온", cohort: null, area: "수원" }],
      out: [{ applicationId: ids.rider, name: "라온", cohort: null, area: "수원역" }],
    });
    expect(JSON.stringify(summary)).not.toContain("010-");
  });

  it("reads a turned-off question as not asked", () => {
    const retreat = seedRetreat();
    retreat.apply({ NAME: "나래", COHORT: "95", ATTENDANCE: { optionId: "opt_partial" }, MEALS: { optionIds: ["opt_d1_dinner"] } });
    for (const key of ["MEALS", "LODGING", "GENDER", "COHORT"]) {
      const hidden = updateField(RETREAT, retreat.formId, retreat.fieldId(key), OWNER, { hidden: true });
      if ("code" in hidden) throw new Error(`${key}: ${hidden.code}`);
    }
    const summary = applicationSummary(RETREAT);

    expect(summary.gender).toBeNull();
    expect(summary.cohorts).toBeNull();
    expect(summary.meals?.unanswered).toBe(1);
    expect(summary.meals?.days[0].slots[0].count).toBe(0);
    expect(summary.lodging?.unanswered).toBe(1);
  });

  it("gives only total, cohorts and attendance for a form made without the setup card", () => {
    const retreat = seedRetreat(null);
    retreat.apply({ NAME: "하나", COHORT: "94" });
    const summary = applicationSummary(RETREAT);

    expect(summary).toMatchObject({
      fromSetup: false,
      total: 1,
      attendance: { asked: false, full: 1, partial: 0, worshipOnly: 0 },
      cohorts: { items: [{ cohort: "94", count: 1 }], noAnswer: 0 },
      gender: null,
      meals: null,
      lodging: null,
      transport: null,
      shuttle: null,
      carpool: null,
      mobility: null,
    });
  });
});
