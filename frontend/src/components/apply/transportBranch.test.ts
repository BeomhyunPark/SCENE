import { describe, expect, it } from "vitest";
import type { FormField, FormSetup } from "../../api/forms";
import { applicationSummary } from "../../mocks/applicationSummary";
import { localUsers } from "../../mocks/fixtures/seed";
import { applySetup, eventFormDetail, markSubmitted, publicForm } from "../../mocks/formStore";
import { groupPeople, seedLargeGroupBoard } from "../../mocks/groupStore";
import { RETREAT, RETREAT_SETUP, seedRetreat } from "../../test/summarySeed";
import { conditionSummary } from "../formBuilder/questionDraft";
import { prune, toAnswerItems, visibleFields, type RawAnswers } from "./answerModel";
import { optionView } from "./optionView";

const OWNER = localUsers[0].userId;
const ALL_TRANSPORT = { groupBus: true, worshipShuttle: true, car: true, publicTransit: true, support: true };
const RANGE: FormSetup = {
  ...RETREAT_SETUP,
  attendance: { partial: true, worshipOnly: true, mode: "RANGE" },
  transport: { ...ALL_TRANSPORT, partialByTime: true },
};
// RETREAT_SETUP schedule: d1 dinner·worship, d2 all four, d3 breakfast·lunch.

function openForm(setup: FormSetup) {
  const retreat = seedRetreat(setup);
  const form = publicForm(RETREAT, retreat.formId);
  if (!("fields" in form)) throw new Error(form.code);
  const fields = [...form.fields].sort((a, b) => a.position - b.position);
  const id = (key: string) => retreat.fieldId(key);
  const pick = (answers: Record<string, string>): RawAnswers =>
    Object.fromEntries(Object.entries(answers).map(([key, optionId]) => [id(key), { optionId }]));
  const offered = (key: string, raw: RawAnswers) =>
    optionView(fieldOf(fields, id(key)), fields, raw).options.map((option) => option.optionId);
  return { retreat, fields, id, pick, offered };
}

function fieldOf(fields: FormField[], fieldId: string): FormField {
  return fields.find((field) => field.fieldId === fieldId)!;
}

describe("transport branches by arrival and departure (#324, #328)", () => {
  it("offers church vehicles by attendance and arrival slot in RANGE (four cases)", () => {
    const { pick, offered, fields, id } = openForm(RANGE);
    const full = pick({ ATTENDANCE: "opt_full" });
    expect(offered("TRANSPORT_IN", full)).toEqual(["opt_group", "opt_car", "opt_ride", "opt_public", "opt_support"]);

    const first = pick({ ATTENDANCE: "opt_partial", ARRIVAL_SLOT: "opt_d1_dinner" });
    expect(offered("TRANSPORT_IN", first)).toEqual(["opt_group", "opt_car", "opt_ride", "opt_public", "opt_support"]);

    const atWorship = pick({ ATTENDANCE: "opt_partial", ARRIVAL_SLOT: "opt_d1_worship" });
    expect(offered("TRANSPORT_IN", atWorship)).toEqual(["opt_shuttle", "opt_car", "opt_ride", "opt_public", "opt_support"]);

    const middle = pick({ ATTENDANCE: "opt_partial", ARRIVAL_SLOT: "opt_d2_lunch" });
    expect(offered("TRANSPORT_IN", middle)).toEqual(["opt_car", "opt_ride", "opt_public", "opt_support"]);
    const notice = optionView(fieldOf(fields, id("TRANSPORT_IN")), fields, middle).notice;
    expect(notice).toContain("첫 일정부터 오는 분만 단체 이동 차량을 탈 수 있어요.");
    expect(notice).toContain("집회 시간에 오는 분만 집회 차량을 탈 수 있어요.");

    const worship = pick({ ATTENDANCE: "opt_worship" });
    expect(offered("TRANSPORT_IN", worship)).toEqual(["opt_shuttle", "opt_car", "opt_ride", "opt_public", "opt_support"]);
    expect(optionView(fieldOf(fields, id("TRANSPORT_IN")), fields, full).notice).toBeNull();
  });

  it("mirrors the way back on the departure slot", () => {
    const { pick, offered, fields, id } = openForm(RANGE);
    const base = { ATTENDANCE: "opt_partial", ARRIVAL_SLOT: "opt_d2_lunch", TRANSPORT_IN: "opt_public" };
    expect(offered("TRANSPORT_OUT", pick({ ...base, DEPARTURE_SLOT: "opt_d3_lunch" }))).toEqual(["opt_group", "opt_public", "opt_support"]);
    expect(offered("TRANSPORT_OUT", pick({ ...base, DEPARTURE_SLOT: "opt_d2_worship" }))).toEqual(["opt_shuttle", "opt_public", "opt_support"]);
    const early = pick({ ...base, DEPARTURE_SLOT: "opt_d2_dinner" });
    expect(offered("TRANSPORT_OUT", early)).toEqual(["opt_public", "opt_support"]);
    expect(optionView(fieldOf(fields, id("TRANSPORT_OUT")), fields, early).notice).toContain(
      "마지막 일정까지 있는 분만 단체 이동 차량을 탈 수 있어요.",
    );
  });

  it("clears a vehicle that the new arrival hides, and the questions it opened", () => {
    const { pick, fields, id } = openForm(RANGE);
    const before = pick({
      ATTENDANCE: "opt_partial",
      ARRIVAL_SLOT: "opt_d1_dinner",
      DEPARTURE_SLOT: "opt_d3_lunch",
      TRANSPORT_IN: "opt_group",
      TRANSPORT_OUT: "opt_group",
    });
    expect(prune(fields, before)[id("TRANSPORT_IN")].optionId).toBe("opt_group");
    const after = prune(fields, { ...before, [id("ARRIVAL_SLOT")]: { optionId: "opt_d2_lunch" } });
    expect(after[id("TRANSPORT_IN")]?.optionId).toBeUndefined();
    expect(after[id("TRANSPORT_OUT")]).toBeUndefined();
    expect(toAnswerItems(fields, after).map((item) => item.fieldId)).not.toContain(id("TRANSPORT_IN"));
  });

  it("asks a rider neither the carpool nor the way back", () => {
    const { pick, fields, id } = openForm(RANGE);
    const shown = (raw: RawAnswers) => visibleFields(fields, raw).map((field) => field.presetKey);
    const drive = shown(pick({ ATTENDANCE: "opt_full", TRANSPORT_IN: "opt_car" }));
    expect(drive).toContain("CARPOOL_OFFER");
    expect(drive).not.toContain("TRANSPORT_OUT");
    const ride = shown(pick({ ATTENDANCE: "opt_full", TRANSPORT_IN: "opt_ride" }));
    expect(ride).not.toContain("CARPOOL_OFFER");
    expect(ride).not.toContain("TRANSPORT_OUT");
    expect(fieldOf(fields, id("TRANSPORT_IN")).config.options?.find((o) => o.optionId === "opt_ride")?.label).toBe(
      "자차 합승 (다른 사람 차를 타요)",
    );
  });

  it("changes only the group bus in SLOTS mode", () => {
    const { pick, offered } = openForm({ ...RANGE, attendance: { ...RANGE.attendance, mode: "SLOTS" } });
    const mealsFirst = pick({ ATTENDANCE: "opt_partial" });
    const form = eventFormDetail(RETREAT)!;
    const meals = form.fields.find((field) => field.presetKey === "MEALS")!.fieldId;
    expect(offered("TRANSPORT_IN", { ...mealsFirst, [meals]: { optionIds: ["opt_d1_dinner", "opt_d2_lunch"] } })).toEqual([
      "opt_group",
      "opt_shuttle",
      "opt_car",
      "opt_ride",
      "opt_public",
      "opt_support",
    ]);
    expect(offered("TRANSPORT_IN", { ...mealsFirst, [meals]: { optionIds: ["opt_d2_lunch"] } })).toEqual([
      "opt_shuttle",
      "opt_car",
      "opt_ride",
      "opt_public",
      "opt_support",
    ]);
  });

  it("keeps the old conditions when the switch is off", () => {
    const { pick, offered } = openForm({ ...RANGE, transport: { ...ALL_TRANSPORT, partialByTime: false } });
    expect(offered("TRANSPORT_IN", pick({ ATTENDANCE: "opt_partial", ARRIVAL_SLOT: "opt_d2_lunch" }))).toEqual([
      "opt_group",
      "opt_shuttle",
      "opt_car",
      "opt_ride",
      "opt_public",
      "opt_support",
    ]);
  });

  it("shortens the arrival and departure lists around the other answer", () => {
    const { pick, fields, id, offered } = openForm(RANGE);
    const arrived = pick({ ATTENDANCE: "opt_partial", ARRIVAL_SLOT: "opt_d2_dinner" });
    expect(offered("DEPARTURE_SLOT", arrived)).toEqual(["opt_d2_dinner", "opt_d2_worship", "opt_d3_breakfast", "opt_d3_lunch"]);
    expect(optionView(fieldOf(fields, id("DEPARTURE_SLOT")), fields, arrived).notice).toBe("도착보다 앞선 칸은 빼고 보여 드려요.");
    const leaving = pick({ ATTENDANCE: "opt_partial", DEPARTURE_SLOT: "opt_d2_breakfast" });
    expect(offered("ARRIVAL_SLOT", leaving)).toEqual(["opt_d1_dinner", "opt_d1_worship", "opt_d2_breakfast"]);
    // A departure picked before a later arrival stays listed so the message has a place.
    const reversed = pick({ ATTENDANCE: "opt_partial", ARRIVAL_SLOT: "opt_d3_breakfast", DEPARTURE_SLOT: "opt_d1_worship" });
    expect(offered("DEPARTURE_SLOT", reversed)).toEqual(["opt_d1_worship", "opt_d3_breakfast", "opt_d3_lunch"]);
  });

  it("words an anyOf condition without breaking", () => {
    const { fields } = openForm(RANGE);
    const bus = fields.find((field) => field.presetKey === "TRANSPORT_IN")!.config.options!.find((o) => o.optionId === "opt_group")!;
    expect(bus.showWhen && "anyOf" in bus.showWhen).toBe(true);
    expect(conditionSummary(bus.showWhen, fields)).toBe(
      "'참석 방식'이(가) 전체 참석일 때 또는 '수련회장에 언제 도착하나요?'이(가) 1월 22일 (금) 저녁부터일 때",
    );
  });
});

describe("mock server for #324", () => {
  it("drops a hidden vehicle pick on submit like the server", () => {
    const { retreat } = openForm(RANGE);
    retreat.apply({
      NAME: "가람",
      ATTENDANCE: { optionId: "opt_partial" },
      ARRIVAL_SLOT: { optionId: "opt_d2_lunch" },
      DEPARTURE_SLOT: { optionId: "opt_d3_lunch" },
      TRANSPORT_IN: { optionId: "opt_group" },
      TRANSPORT_OUT: { optionId: "opt_group" },
    });
    const summary = applicationSummary(RETREAT);
    expect(summary.transport?.in.noAnswer).toBe(1);
  });

  it("counts riders as riders both ways", () => {
    const { retreat } = openForm(RANGE);
    retreat.apply({ NAME: "하나", ATTENDANCE: { optionId: "opt_full" }, TRANSPORT_IN: { optionId: "opt_ride" } });
    retreat.apply({ NAME: "둘", ATTENDANCE: { optionId: "opt_full" }, TRANSPORT_IN: { optionId: "opt_car" }, CARPOOL_OFFER: { value: false } });
    const transport = applicationSummary(RETREAT).transport!;
    const count = (rows: typeof transport.in, id: string) => rows.options.find((option) => option.optionId === id)?.count;
    expect(count(transport.in, "opt_ride")).toBe(1);
    expect(count(transport.out, "opt_ride")).toBe(1);
    expect(count(transport.out, "opt_car")).toBe(1);
    expect(transport.out.noAnswer).toBe(0);
  });

  it("keeps partialByTime when missing, and locks it once applications are in", () => {
    const { retreat } = openForm(RANGE);
    const { partialByTime: _, ...without } = RANGE.transport;
    void _;
    const kept = applySetup(RETREAT, retreat.formId, OWNER, { ...RANGE, transport: without });
    expect("code" in kept ? kept.code : kept.setup?.transport.partialByTime).toBe(true);
    markSubmitted(RETREAT, retreat.formId);
    const toggled = applySetup(RETREAT, retreat.formId, OWNER, { ...RANGE, transport: { ...RANGE.transport, partialByTime: false } });
    expect(toggled).toMatchObject({ status: 409, code: "FIELD_LOCKED" });
    const noPartial = applySetup(RETREAT, retreat.formId, OWNER, { ...RANGE, attendance: { ...RANGE.attendance, partial: false } });
    expect(noPartial).toMatchObject({ status: 409, code: "FIELD_LOCKED" });
    const day = { breakfast: true, lunch: true, dinner: true, worship: true };
    const newFirst = applySetup(RETREAT, retreat.formId, OWNER, { ...RANGE, schedule: [day, RANGE.schedule[1], RANGE.schedule[2]] });
    expect(newFirst).toMatchObject({ status: 409, code: "FIELD_LOCKED" });
    const transit = applySetup(RETREAT, retreat.formId, OWNER, { ...RANGE, transport: { ...RANGE.transport, publicTransit: false } });
    expect("code" in transit).toBe(false);
  });

  it("writes mock cohorts as two digits", () => {
    seedLargeGroupBoard(RETREAT, 30, 3);
    const cohorts = groupPeople(RETREAT).map((person) => person.cohort).filter((cohort): cohort is string => cohort !== null);
    expect(cohorts).toContain("00");
    expect(cohorts).toContain("01");
    expect(cohorts.every((cohort) => /^\d{2}$/.test(cohort))).toBe(true);
  });
});
