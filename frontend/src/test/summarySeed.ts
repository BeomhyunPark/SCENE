import type { FormSetup } from "../api/forms";
import { localSpace, localUsers } from "../mocks/fixtures/seed";
import { applySetup, createForm, setAccepting } from "../mocks/formStore";
import { addEvent } from "../mocks/operatorStore";
import { submitPublicApplication } from "../mocks/participantStore";

export const RETREAT = "00000000-0000-4000-8000-000000000251";
const OWNER = localUsers[0].userId;

const slots = (breakfast: boolean, lunch: boolean, dinner: boolean, worship: boolean) => ({
  breakfast,
  lunch,
  dinner,
  worship,
});

export const RETREAT_SETUP: FormSetup = {
  gender: true,
  middleGroup: false,
  cell: false,
  attendance: { partial: true, worshipOnly: true },
  schedule: [slots(false, false, true, true), slots(true, true, true, true), slots(true, true, false, false)],
  transport: { groupBus: true, worshipShuttle: true, car: true, publicTransit: false, support: true },
};

type Answer = string | { optionId: string } | { optionIds: string[] } | { value: boolean } | { number: number };

/** A 2027-01-22..24 retreat with an open form. `setup: null` keeps the plain three-question form. */
export function seedRetreat(setup: FormSetup | null = RETREAT_SETUP) {
  addEvent({
    eventId: RETREAT,
    spaceId: localSpace.spaceId,
    name: "겨울 수련회",
    lifecycleStatus: "ACTIVE",
    lifecycleVersion: 1,
    startDate: "2027-01-22",
    endDate: "2027-01-24",
    place: null,
    eventType: null,
  });
  const created = createForm(RETREAT, OWNER, {});
  if ("code" in created) throw new Error(created.code);
  const form = setup ? applySetup(RETREAT, created.formId, OWNER, setup) : created;
  if ("code" in form) throw new Error(form.code);
  const opened = setAccepting(RETREAT, form.formId, OWNER, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  const idOf = (key: string) => {
    const field = form.fields.find((item) => item.presetKey === key || (item.presetKey === null && item.systemKey === key));
    if (!field) throw new Error(`no ${key}`);
    return field.fieldId;
  };
  return {
    formId: form.formId,
    fieldId: idOf,
    /** Submits one application; answers are keyed by preset or system key. Returns the application id. */
    apply(answers: Record<string, Answer>): string {
      const items = Object.entries({ PHONE: "010-0000-0000", ...answers }).map(([key, value]) =>
        typeof value === "string" ? { fieldId: idOf(key), text: value } : { fieldId: idOf(key), value },
      );
      const submitted = submitPublicApplication(RETREAT, form.formId, { answers: items });
      if ("code" in submitted) throw new Error(submitted.code);
      return submitted.applicationId;
    },
  };
}

/** Four applicants that touch every area: full, partial driver, worship-only shuttle, partial needing a ride. */
export function seedFourApplicants() {
  const retreat = seedRetreat();
  const ids = {
    full: retreat.apply({
      NAME: "하나",
      COHORT: "94",
      GENDER: { optionId: "opt_female" },
      ATTENDANCE: { optionId: "opt_full" },
      TRANSPORT_IN: { optionId: "opt_group" },
      TRANSPORT_OUT: { optionId: "opt_group" },
    }),
    driver: retreat.apply({
      NAME: "나래",
      COHORT: "95",
      GENDER: { optionId: "opt_male" },
      ATTENDANCE: { optionId: "opt_partial" },
      MEALS: { optionIds: ["opt_d1_dinner"] },
      LODGING: { optionIds: ["opt_n1"] },
      TRANSPORT_IN: { optionId: "opt_car" },
      CARPOOL_OFFER: { value: true },
      CARPOOL_SEATS: { number: 3 },
      CARPOOL_AREA: "분당",
      CARPOOL_NOTE: "판교 경유 가능",
    }),
    shuttle: retreat.apply({
      NAME: "다온",
      COHORT: "00",
      GENDER: { optionId: "opt_female" },
      ATTENDANCE: { optionId: "opt_worship" },
      MEALS: { optionIds: ["opt_d2_worship"] },
      TRANSPORT_IN: { optionId: "opt_shuttle" },
      SHUTTLE_IN: { optionIds: ["opt_d1", "opt_d2"] },
      TRANSPORT_OUT: { optionId: "opt_shuttle" },
      SHUTTLE_OUT: { optionIds: ["opt_d2"] },
    }),
    rider: retreat.apply({
      NAME: "라온",
      ATTENDANCE: { optionId: "opt_partial" },
      TRANSPORT_IN: { optionId: "opt_support" },
      MOBILITY_IN: "수원",
      TRANSPORT_OUT: { optionId: "opt_support" },
      MOBILITY_OUT: "수원역",
    }),
  };
  return { ...retreat, ids };
}
