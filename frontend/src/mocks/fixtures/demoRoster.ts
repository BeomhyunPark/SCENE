import type { FormField } from "../../api/forms";
import { addField, applySetup, createForm, formFields, setAccepting } from "../formStore";
import { eventById, setLifecycle } from "../operatorStore";
import { seedApplication } from "../participantStore";
import { seedCheckIn } from "../checkInStore";
import { seedAssignment } from "../groupStore";
import { localEvent, localUsers } from "./seed";

/**
 * A retreat-sized roster for the 참가 현황 table (#308): the generated retreat form (DEC-070) plus
 * extra questions of every type, and `count` applicants with deterministic answers, groups and
 * check-ins. Used by the scale test and by the VITE_API_MOCK=1 click-through, where it is loaded
 * from the browser with `import("/src/mocks/fixtures/demoRoster.ts")`. Names are made up.
 */
export function seedDemoRoster(count = 200, eventId: string = localEvent.eventId): { formId: string; fields: FormField[] } {
  const owner = localUsers[0].userId;
  const event = eventById(eventId);
  if (!event) throw new Error("no event");
  Object.assign(event, { startDate: "2027-01-22", endDate: "2027-01-24" });
  const form = createForm(eventId, owner, {});
  if ("code" in form) throw new Error(form.code);
  const day = { breakfast: true, lunch: true, dinner: true, worship: true };
  const setup = applySetup(eventId, form.formId, owner, {
    gender: true,
    middleGroup: true,
    cell: true,
    attendance: { partial: true, worshipOnly: true },
    schedule: [day, day, day],
    transport: { groupBus: true, worshipShuttle: true, car: true, publicTransit: true, support: true },
  });
  if ("code" in setup) throw new Error(setup.code);
  const extras = [
    { label: "보호자 연락처", answerType: "SHORT_TEXT", config: { maxLength: 50, format: "PHONE" } },
    { label: "티셔츠 크기", answerType: "DROPDOWN", config: { options: ["S", "M", "L", "XL"].map((label) => ({ label })) } },
    { label: "섬기고 싶은 곳", answerType: "MULTI_CHOICE", config: { options: ["찬양", "식사", "안내", "중보"].map((label) => ({ label })), allowOther: true } },
    { label: "첫 수련회인가요?", answerType: "YES_NO", config: { style: "YES_NO" } },
    { label: "나이", answerType: "NUMBER", config: { unit: "세", min: 15, max: 80 } },
    { label: "알레르기·건강", answerType: "LONG_TEXT", config: { maxLength: 500 } },
    { label: "기도 제목", answerType: "LONG_TEXT", config: { maxLength: 1000 } },
    { label: "옛 질문", answerType: "SHORT_TEXT", config: { maxLength: 100 }, hidden: true },
  ];
  for (const extra of extras) {
    const added = addField(eventId, form.formId, owner, extra);
    if ("code" in added) throw new Error(`${extra.label}: ${added.code}`);
  }
  setLifecycle(eventId, "ACTIVE", 1);
  const opened = setAccepting(eventId, form.formId, owner, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);

  const fields = formFields(eventId, form.formId);
  const groups = Array.from({ length: 12 }, (_, index) => ({ groupId: `demo-group-${index + 1}`, name: `${index + 1}조` }));
  const random = seeded(308);
  for (let index = 0; index < count; index++) {
    const answers: { fieldId: string; value: Record<string, unknown> }[] = [];
    const given: Record<string, Record<string, unknown>> = {};
    for (const field of fields) {
      if (field.hidden && index % 7 !== 0) continue;
      if (!visible(field, given)) continue;
      const value = answerFor(field, index, random);
      if (!value) continue;
      given[field.fieldId] = value;
      answers.push({ fieldId: field.fieldId, value });
    }
    const minute = String(index % 60).padStart(2, "0");
    const hour = String(Math.floor(index / 60) % 24).padStart(2, "0");
    const submitted = seedApplication(eventId, form.formId, `2026-12-${String(15 + (index % 10)).padStart(2, "0")}T${hour}:${minute}:00Z`, answers);
    if (random() < 0.8) {
      const group = groups[index % groups.length];
      seedAssignment(eventId, submitted.participantId, { ...group, leader: index % 17 === 0 });
    }
    if (random() < 0.35) seedCheckIn(eventId, submitted.participantId, "2027-01-22T01:30:00Z");
  }
  return { formId: form.formId, fields };
}

const FAMILY = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"];
const GIVEN = ["하늘", "서연", "민준", "지우", "도윤", "하은", "시우", "예린", "준서", "수아", "건우", "다은", "현우", "유나", "지호"];
const MIDDLE = ["청년1부", "청년2부", "대학부", "새가족", "영어예배"];
const CELLS = ["소망셀", "믿음셀", "사랑셀", "은혜셀", "나눔셀", "기쁨셀"];

function answerFor(field: FormField, index: number, random: () => number): Record<string, unknown> | null {
  if (field.systemKey === "NAME") return { text: FAMILY[index % FAMILY.length] + GIVEN[(index * 7) % GIVEN.length] };
  if (field.systemKey === "PHONE") return { text: `010-${pad(1000 + ((index * 37) % 9000))}-${pad(1000 + ((index * 91) % 9000))}` };
  if (field.systemKey === "COHORT") return { text: String(88 + (index % 14)).slice(-2) };
  if (field.presetKey === "MIDDLE_GROUP") return { text: MIDDLE[index % MIDDLE.length] };
  if (field.presetKey === "CELL") return random() < 0.9 ? { text: CELLS[index % CELLS.length] } : null;
  if (random() < 0.08 && !field.required) return null;
  const options = (field.config.options ?? []).filter((option) => !option.hidden);
  switch (field.answerType) {
    case "SINGLE_CHOICE":
    case "DROPDOWN":
      if (options.length === 0) return null;
      if (field.config.allowOther && random() < 0.05) return { other: "직접 입력" };
      return { optionId: pick(options, random).optionId };
    case "MULTI_CHOICE": {
      if (options.length === 0) return null;
      const chosen = options.filter(() => random() < 0.55).map((option) => option.optionId);
      const value: Record<string, unknown> = { optionIds: chosen.length > 0 ? chosen : [options[0].optionId] };
      if (field.config.allowOther && random() < 0.07) value.other = "기타 의견";
      return value;
    }
    case "YES_NO":
      return { value: field.config.style === "CONSENT" ? true : random() < 0.4 };
    case "NUMBER": {
      const min = typeof field.config.min === "number" ? field.config.min : 1;
      const max = typeof field.config.max === "number" ? Math.min(field.config.max, min + 40) : min + 4;
      return { number: min + Math.floor(random() * (max - min + 1)) };
    }
    case "DATE":
      return field.config.includeTime
        ? { dateTime: `2027-01-2${2 + Math.floor(random() * 3)}T${pad2(9 + Math.floor(random() * 10))}:00` }
        : { date: `2027-01-2${2 + Math.floor(random() * 3)}` };
    case "DATE_RANGE":
      return { start: "2027-01-22", end: `2027-01-2${2 + Math.floor(random() * 3)}` };
    case "LONG_TEXT":
      return random() < 0.3 ? { text: random() < 0.5 ? "땅콩 알레르기" : "늦게 도착할 수 있어요" } : null;
    default:
      if (field.config.format === "PHONE") return { text: `010-${pad(2000 + index)}-${pad(5000 + index)}` };
      return random() < 0.5 ? { text: "메모" } : null;
  }
}

/** Mirrors the form's showWhen: an answer exists only when its question would be shown (DEC-068). */
function visible(field: FormField, given: Record<string, Record<string, unknown>>): boolean {
  const when = field.showWhen;
  if (!when) return true;
  const answer = given[when.fieldId];
  if (!answer) return false;
  if ("equals" in when) return answer.value === when.equals;
  const ids = [answer.optionId, ...(Array.isArray(answer.optionIds) ? answer.optionIds : [])];
  return ids.some((id) => typeof id === "string" && when.optionIds.includes(id));
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function pad(value: number): string {
  return String(value).padStart(4, "0");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Mulberry32, so every run gets the same roster. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
