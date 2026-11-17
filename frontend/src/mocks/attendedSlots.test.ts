import { describe, expect, it } from "vitest";
import { getApplicationTable } from "../api/applications";
import { login } from "../api/session";
import { RETREAT, RETREAT_SETUP, seedRetreat } from "../test/summarySeed";
import { applicationSummary } from "./applicationSummary";
import { attendedSlotIds, formSlots } from "./attendedSlots";
import { localUsers } from "./fixtures/seed";
import { applySetup, eventFormDetail, markSubmitted } from "./formStore";

const RANGE = { ...RETREAT_SETUP, attendance: { partial: true, worshipOnly: true, mode: "RANGE" as const } };
const ALL = [
  "opt_d1_dinner",
  "opt_d1_worship",
  "opt_d2_breakfast",
  "opt_d2_lunch",
  "opt_d2_dinner",
  "opt_d2_worship",
  "opt_d3_breakfast",
  "opt_d3_lunch",
];

function seedRange() {
  const retreat = seedRetreat(RANGE);
  const partial = (from: string, to: string) => ({
    ATTENDANCE: { optionId: "opt_partial" },
    ARRIVAL_SLOT: { optionId: from },
    DEPARTURE_SLOT: { optionId: to },
  });
  const ids = {
    full: retreat.apply({ NAME: "하나", ATTENDANCE: { optionId: "opt_full" } }),
    sameSlot: retreat.apply({ NAME: "둘", ...partial("opt_d1_dinner", "opt_d1_dinner") }),
    weekend: retreat.apply({ NAME: "셋", ...partial("opt_d2_lunch", "opt_d3_lunch") }),
    worship: retreat.apply({ NAME: "넷", ATTENDANCE: { optionId: "opt_worship" }, MEALS: { optionIds: ["opt_d1_worship", "opt_d2_worship"] } }),
    unknown: retreat.apply({ NAME: "다섯", ATTENDANCE: { optionId: "opt_partial" } }),
  };
  return { retreat, ids };
}

describe("mock attended slots (DEC-074, one rule for summary, table and CSV)", () => {
  it("generates arrival and departure from the schedule and no date, lodging or partial meal question", () => {
    const { retreat } = seedRange();
    const form = eventFormDetail(RETREAT)!;
    const keys = form.fields.map((field) => field.presetKey).filter(Boolean);
    expect(keys).toEqual(expect.arrayContaining(["ARRIVAL_SLOT", "DEPARTURE_SLOT", "MEALS", "PARTIAL_NOTE"]));
    expect(keys).not.toContain("ARRIVAL_AT");
    expect(keys).not.toContain("LODGING");
    // A setup without the commuter switch (saved before it) asks no NO_LODGING.
    expect(keys).not.toContain("NO_LODGING");
    const arrival = form.fields.find((field) => field.fieldId === retreat.fieldId("ARRIVAL_SLOT"))!;
    expect(arrival.config.options?.map((option) => option.optionId)).toEqual(ALL);
    expect(arrival.config.options?.[0].label).toBe("1월 22일 (금) 저녁부터");
    const meals = form.fields.find((field) => field.presetKey === "MEALS")!;
    expect(meals.label).toBe("참석할 집회를 선택해주세요");
    expect(meals.showWhen).toEqual({ fieldId: retreat.fieldId("ATTENDANCE"), optionIds: ["opt_worship"] });
    expect(meals.config.options?.filter((option) => !option.hidden).map((option) => option.optionId)).toEqual([
      "opt_d1_worship",
      "opt_d2_worship",
    ]);
  });

  it("counts boundary slots, full attendance and worship-only the same in every view", async () => {
    const { retreat, ids } = seedRange();
    const form = eventFormDetail(RETREAT)!;
    const slots = formSlots(form)!;
    const of = (answers: Record<string, unknown>) =>
      attendedSlotIds(
        form,
        slots,
        new Map(Object.entries(answers).map(([key, value]) => [retreat.fieldId(key), value as Record<string, unknown>])),
      );
    expect(of({ ATTENDANCE: { optionId: "opt_full" } })).toEqual(ALL);
    expect(of({ ATTENDANCE: { optionId: "opt_partial" }, ARRIVAL_SLOT: { optionId: "opt_d1_dinner" }, DEPARTURE_SLOT: { optionId: "opt_d1_dinner" } })).toEqual([
      "opt_d1_dinner",
    ]);
    expect(of({ ATTENDANCE: { optionId: "opt_partial" }, ARRIVAL_SLOT: { optionId: "opt_d1_dinner" } })).toBeNull();

    const summary = applicationSummary(RETREAT);
    const count = Object.fromEntries(summary.meals!.days.flatMap((day) => day.slots.map((slot) => [slot.optionId, slot.count])));
    // full 8 slots; 둘: d1 dinner; 셋: d2 lunch..d3 lunch; 넷: two services; 다섯: 모름
    expect(count).toEqual({
      opt_d1_dinner: 2,
      opt_d1_worship: 2,
      opt_d2_breakfast: 1,
      opt_d2_lunch: 2,
      opt_d2_dinner: 2,
      opt_d2_worship: 3,
      opt_d3_breakfast: 2,
      opt_d3_lunch: 2,
    });
    expect(summary.meals!.unanswered).toBe(1);
    // Nights come from the range: 둘 arrives and leaves on day 1, 셋 sleeps night 2 only.
    expect(summary.lodging!.nights.map((night) => night.count)).toEqual([1, 2]);
    expect(summary.lodging!.unanswered).toBe(1);

    await login({ userId: localUsers[0].userId });
    const table = await getApplicationTable(RETREAT);
    expect(table.slots?.map((slot) => slot.slotId)).toEqual(ALL);
    const byId = Object.fromEntries(table.rows.map((row) => [row.applicationId, row.slotIds]));
    expect(byId[ids.full]).toEqual(ALL);
    expect(byId[ids.sameSlot]).toEqual(["opt_d1_dinner"]);
    expect(byId[ids.weekend]).toEqual(["opt_d2_lunch", "opt_d2_dinner", "opt_d2_worship", "opt_d3_breakfast", "opt_d3_lunch"]);
    expect(byId[ids.worship]).toEqual(["opt_d1_worship", "opt_d2_worship"]);
    expect(byId[ids.unknown]).toBeNull();
  });

  it("drops commuters who checked 숙박하지 않아요 from every night (DEC-074 Follow-up)", () => {
    const retreat = seedRetreat({ ...RANGE, attendance: { ...RANGE.attendance, noLodging: true } });
    const form = eventFormDetail(RETREAT)!;
    const stay = form.fields.find((field) => field.presetKey === "NO_LODGING")!;
    expect(stay.answerType).toBe("MULTI_CHOICE");
    expect(stay.required).toBe(false);
    expect(stay.showWhen).toEqual({ fieldId: retreat.fieldId("ATTENDANCE"), optionIds: ["opt_full", "opt_partial"] });
    const home = { NO_LODGING: { optionIds: ["opt_no_lodging"] } };
    const partial = { ATTENDANCE: { optionId: "opt_partial" }, ARRIVAL_SLOT: { optionId: "opt_d1_dinner" }, DEPARTURE_SLOT: { optionId: "opt_d3_lunch" } };
    retreat.apply({ NAME: "하나", ATTENDANCE: { optionId: "opt_full" } });
    retreat.apply({ NAME: "둘", ATTENDANCE: { optionId: "opt_full" }, ...home });
    retreat.apply({ NAME: "셋", ...partial });
    retreat.apply({ NAME: "넷", ...partial, ...home });

    const summary = applicationSummary(RETREAT);
    expect(summary.lodging!.nights.map((night) => night.count)).toEqual([2, 2]);
    expect(summary.lodging!.unanswered).toBe(0);
    // Meals still follow the range.
    expect(summary.meals!.days[0].slots[0].count).toBe(4);
  });

  it("refuses a departure before the arrival, and another mode once applications are in", () => {
    const { retreat } = seedRange();
    expect(() =>
      retreat.apply({
        NAME: "거꾸로",
        ATTENDANCE: { optionId: "opt_partial" },
        ARRIVAL_SLOT: { optionId: "opt_d2_lunch" },
        DEPARTURE_SLOT: { optionId: "opt_d1_dinner" },
      }),
    ).toThrow("APPLICATION_VALIDATION_FAILED");
    markSubmitted(RETREAT, retreat.formId);
    const owner = localUsers[0].userId;
    expect(applySetup(RETREAT, retreat.formId, owner, { ...RANGE, attendance: { ...RANGE.attendance, mode: "SLOTS" } })).toEqual({
      status: 409,
      code: "FIELD_LOCKED",
    });
    // Leaving the key out keeps the stored mode.
    const kept = applySetup(RETREAT, retreat.formId, owner, { ...RANGE, attendance: { partial: true, worshipOnly: true } });
    expect("setup" in kept && kept.setup?.attendance.mode).toBe("RANGE");
  });
});
