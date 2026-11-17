import type { AnswerType, Condition, FieldConfig, FieldOption, FormSetup, ShowWhen } from "../api/forms";

/**
 * Mock copy of the server's generated questions (DEC-070, backend `FormPreset`). It follows the
 * same keys, option ids, and conditions so the setup screen works without a server. The backend
 * integration tests are the source of truth.
 */
export const PRESET_ORDER = [
  "GENDER",
  "MIDDLE_GROUP",
  "CELL",
  "NEWCOMER",
  "ATTENDANCE",
  "ARRIVAL_AT",
  "DEPARTURE_AT",
  "ARRIVAL_SLOT",
  "DEPARTURE_SLOT",
  "LODGING",
  "MEALS",
  "PARTIAL_NOTE",
  "TRANSPORT_IN",
  "SHUTTLE_IN",
  "CARPOOL_OFFER",
  "CARPOOL_SEATS",
  "CARPOOL_AREA",
  "CARPOOL_NOTE",
  "MOBILITY_IN",
  "TRANSPORT_OUT",
  "SHUTTLE_OUT",
  "MOBILITY_OUT",
  "CONSENT",
];

export type PresetQuestion = {
  key: string;
  label: string;
  description: string | null;
  answerType: AnswerType;
  required: boolean;
  config: FieldConfig;
  showWhen: ShowWhen | null;
};

const SLOT_WORDS: [key: "breakfast" | "lunch" | "dinner" | "worship", word: string][] = [
  ["breakfast", "아침"],
  ["lunch", "점심"],
  ["dinner", "저녁"],
  ["worship", "집회"],
];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const ORDINALS = ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째", "일곱째", "여덟째", "아홉째"];
const SUPPORT_NOTICE = "이동 지원은 매칭이 보장되지 않으며, 탑승 위치가 희망 지역과 달라질 수 있습니다.";

/** Days from `start` to `end`, both included. Dates are `YYYY-MM-DD`. */
export function eventDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

function dateAt(start: string, offset: number): Date {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000);
}

/** Example: `1월 22일 (금)`. */
export function dayLabel(start: string, offset: number): string {
  const date = dateAt(start, offset);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${WEEKDAYS[date.getUTCDay()]})`;
}

function option(optionId: string, label: string, extra: Partial<FieldOption> = {}): FieldOption {
  return { optionId, label, group: null, hidden: false, showWhen: null, ...extra };
}

const single = (options: FieldOption[], buttons: boolean): FieldConfig => ({
  options,
  allowOther: false,
  display: buttons ? "BUTTONS" : "LIST",
});
const multi = (options: FieldOption[]): FieldConfig => ({ options, allowOther: false, minSelect: 0, maxSelect: null });
const shortText = (maxLength: number): FieldConfig => ({ maxLength, format: "NONE", placeholder: null });
const longText = (): FieldConfig => ({ maxLength: 1000, placeholder: null });

/** Option id of the 새가족 (등반X) option (DEC-070 Follow-up 2026-11-17). */
export const NEWCOMER_OPTION = "opt_newcomer";
const NEWCOMER_LABEL = "새가족 (등반X)";

/**
 * A listed name's option id. The server hashes with SHA-256; the mock uses FNV-1a, which is enough
 * for the same name to keep the same id.
 */
export function listOptionId(prefix: string, name: string): string {
  let hash = 0x811c9dc5;
  for (const char of new TextEncoder().encode(name)) {
    hash = Math.imul(hash ^ char, 0x01000193) >>> 0;
  }
  return `opt_${prefix}_${hash.toString(16).padStart(8, "0")}`;
}

function cleanNames(names: readonly string[] | undefined): string[] {
  return [...new Set((names ?? []).map((name) => name.trim()).filter((name) => name !== ""))];
}

function affiliation(
  setup: FormSetup,
  add: (
    key: string,
    label: string,
    description: string | null,
    answerType: AnswerType,
    required: boolean,
    config: FieldConfig,
    showWhen: ShowWhen | null,
  ) => void,
  when: (key: string, ...optionIds: string[]) => ShowWhen,
) {
  const middleNames = setup.middleGroup ? cleanNames(setup.middleGroups) : [];
  const cellNames = setup.cell ? cleanNames(setup.cells) : [];
  const middleIds = middleNames.map((name) => listOptionId("mg", name));
  if (middleNames.length > 0) {
    const options = middleNames.map((name, index) => option(middleIds[index], name));
    options.push(option(NEWCOMER_OPTION, NEWCOMER_LABEL));
    add(
      "MIDDLE_GROUP",
      "중그룹",
      `소속 중그룹을 골라주세요. 아직 중그룹이 없는 새가족은 '${NEWCOMER_LABEL}'을 골라주세요.`,
      "DROPDOWN",
      true,
      { options },
      null,
    );
  } else if (setup.middleGroup) {
    add("MIDDLE_GROUP", "중그룹", "소속 중그룹이 있으면 적어주세요.", "SHORT_TEXT", false, shortText(50), null);
  }
  if (!setup.cell) return;
  const whenListed = middleIds.length > 0 ? when("MIDDLE_GROUP", ...middleIds) : null;
  if (cellNames.length > 0) {
    const options = cellNames.map((name) => option(listOptionId("cell", name), name));
    let description = "소속 셀을 골라주세요.";
    if (middleIds.length === 0) {
      options.push(option(NEWCOMER_OPTION, NEWCOMER_LABEL));
      description += ` 아직 셀이 없는 새가족은 '${NEWCOMER_LABEL}'을 골라주세요.`;
    }
    add("CELL", "셀", description, "DROPDOWN", true, { options }, whenListed);
  } else {
    add("CELL", "셀", "소속 셀이 있으면 적어주세요.", "SHORT_TEXT", false, shortText(50), whenListed);
  }
}

export function generatePreset(
  setup: FormSetup,
  start: string,
  end: string,
  idOf: (key: string) => string,
): PresetQuestion[] {
  const out: PresetQuestion[] = [];
  const days = eventDays(start, end);
  const attendance = setup.attendance.partial || setup.attendance.worshipOnly;
  const when = (key: string, ...optionIds: string[]): ShowWhen => ({ fieldId: idOf(key), optionIds });
  const add = (
    key: string,
    label: string,
    description: string | null,
    answerType: AnswerType,
    required: boolean,
    config: FieldConfig,
    showWhen: ShowWhen | null,
  ) => out.push({ key, label, description, answerType, required, config, showWhen });

  if (setup.gender) {
    add("GENDER", "성별", null, "SINGLE_CHOICE", true, single([option("opt_female", "여성"), option("opt_male", "남성")], true), null);
  }
  affiliation(setup, add, when);

  if (attendance) {
    add(
      "ATTENDANCE",
      "참석 방식",
      null,
      "SINGLE_CHOICE",
      true,
      single(
        [
          option("opt_full", "전체 참석"),
          option("opt_partial", "부분 참석", { hidden: !setup.attendance.partial }),
          option("opt_worship", "집회만 참석", { hidden: !setup.attendance.worshipOnly }),
        ],
        true,
      ),
      null,
    );
  }
  const whenPartial = attendance ? when("ATTENDANCE", "opt_partial") : null;
  const range = setup.attendance.mode === "RANGE";
  // Every slot on the schedule in order: [id, "1월 22일 (금) 저녁", day label, slot word].
  const slots: [string, string, string, string][] = [];
  setup.schedule.forEach((day, index) => {
    const group = dayLabel(start, index);
    for (const [key, word] of SLOT_WORDS) {
      if (day[key]) slots.push([`opt_d${index + 1}_${key}`, `${group} ${word}`, group, word]);
    }
  });
  if (setup.attendance.partial && range) {
    // DEC-074: the arrival and departure slots stand for every slot between them.
    if (slots.length > 0) {
      const from = slots.map(([id, label]) => option(id, `${label}부터`));
      const to = slots.map(([id, label]) => option(id, `${label}까지`));
      add(
        "ARRIVAL_SLOT",
        "수련회장에 언제 도착하나요?",
        "도착부터 출발까지의 식사와 프로그램에 모두 참석하는 것으로 신청됩니다.",
        "SINGLE_CHOICE",
        true,
        single(from, false),
        whenPartial,
      );
      add("DEPARTURE_SLOT", "수련회장에서 언제 출발하나요?", null, "SINGLE_CHOICE", true, single(to, false), whenPartial);
    }
  } else if (setup.attendance.partial) {
    const dates: FieldConfig = { includeTime: true, min: `${start}T00:00`, max: `${end}T23:59` };
    add("ARRIVAL_AT", "수련회장에 언제 도착할 예정인가요?", null, "DATE", true, dates, whenPartial);
    add("DEPARTURE_AT", "수련회장에서 언제 출발할 예정인가요?", null, "DATE", true, { ...dates }, whenPartial);
    if (days > 1) {
      const nights = Array.from({ length: days - 1 }, (_, index) =>
        option(`opt_n${index + 1}`, `${ORDINALS[index]} 밤 (${dayLabel(start, index)})`),
      );
      add("LODGING", "숙박하는 밤을 모두 골라주세요", "숙박하지 않으면 비워 두세요.", "MULTI_CHOICE", false, multi(nights), whenPartial);
    }
  }
  const worshipDays: number[] = [];
  const cells = slots.map(([id, , group, word]) => option(id, word, { group }));
  if (attendance && !range && cells.length > 0) {
    add(
      "MEALS",
      "참석할 프로그램과 식사를 선택해주세요",
      "참석하는 일정에 포함되는 식사와 프로그램을 모두 선택해 주세요. ※ 식사는 실제 식사 여부와 관계없이 참석 일정에 포함된 경우 신청 인원에 반영됩니다.",
      "MULTI_CHOICE",
      true,
      multi(cells),
      when("ATTENDANCE", "opt_partial", "opt_worship"),
    );
  }
  if (setup.attendance.worshipOnly && range && cells.some((cell) => cell.optionId.endsWith("_worship"))) {
    // DEC-074: worship-only still picks services; meals stay listed but hidden so ids match SLOTS.
    const services = cells.map((cell) => ({ ...cell, hidden: !cell.optionId.endsWith("_worship") }));
    add("MEALS", "참석할 집회를 선택해주세요", null, "MULTI_CHOICE", true, multi(services), when("ATTENDANCE", "opt_worship"));
  }
  setup.schedule.forEach((slots, index) => {
    if (slots.worship) worshipDays.push(index + 1);
  });
  if (setup.attendance.partial) {
    const note = range ? "중간에 나갔다가 다시 오거나 수련회장에서 자지 않는다면 적어 주세요." : null;
    add("PARTIAL_NOTE", "운영진이 알아야 할 부분 참석 메모가 있나요?", note, "LONG_TEXT", false, longText(), whenPartial);
  }

  const transport = setup.transport;
  if (transport.groupBus || transport.worshipShuttle || transport.car || transport.publicTransit || transport.support) {
    const shuttle = transport.worshipShuttle && attendance && worshipDays.length > 0;
    const forBus = attendance ? when("ATTENDANCE", "opt_full", "opt_partial") : null;
    const forShuttle = attendance ? when("ATTENDANCE", "opt_partial", "opt_worship") : null;
    let busIn = forBus;
    let busOut = forBus;
    let shuttleIn = forShuttle;
    let shuttleOut = forShuttle;
    if (transport.partialByTime && attendance && setup.attendance.partial && slots.length > 0) {
      // #324: a partial attendee rides a church vehicle only when they come or leave with it.
      const first = slots[0][0];
      const last = slots[slots.length - 1][0];
      const anyOf = (...clauses: ShowWhen[]): ShowWhen => ({ anyOf: clauses as Condition[] });
      if (range) {
        const worship = slots.map(([id]) => id).filter((id) => id.endsWith("_worship"));
        busIn = anyOf(when("ATTENDANCE", "opt_full"), when("ARRIVAL_SLOT", first));
        busOut = anyOf(when("ATTENDANCE", "opt_full"), when("DEPARTURE_SLOT", last));
        if (worship.length > 0) {
          shuttleIn = anyOf(when("ATTENDANCE", "opt_worship"), when("ARRIVAL_SLOT", ...worship));
          shuttleOut = anyOf(when("ATTENDANCE", "opt_worship"), when("DEPARTURE_SLOT", ...worship));
        }
      } else {
        busIn = anyOf(when("ATTENDANCE", "opt_full"), when("MEALS", first));
        busOut = anyOf(when("ATTENDANCE", "opt_full"), when("MEALS", last));
      }
    }
    const rounds = (suffix: string) =>
      worshipDays.map((day) => option(`opt_d${day}`, `${dayLabel(start, day - 1)} ${suffix}`));
    add(
      "TRANSPORT_IN",
      "수련회장에 어떻게 가세요?",
      null,
      "SINGLE_CHOICE",
      true,
      single(
        [
          option("opt_group", "단체 이동 차량", { hidden: !transport.groupBus, showWhen: busIn }),
          option("opt_shuttle", "집회 차량", { hidden: !shuttle, showWhen: shuttleIn }),
          option("opt_car", "자차 (직접 운전)", { hidden: !transport.car }),
          option("opt_ride", "자차 합승 (다른 사람 차를 타요)", { hidden: !transport.car }),
          option("opt_public", "대중교통", { hidden: !transport.publicTransit }),
          option("opt_support", "이동 지원 요청", { hidden: !transport.support }),
        ],
        false,
      ),
      null,
    );
    if (shuttle) {
      add(
        "SHUTTLE_IN",
        "가는 집회 차량은 언제 타세요?",
        "교회에서 수련회장으로 가는 차량입니다. 타는 날을 모두 골라주세요.",
        "MULTI_CHOICE",
        true,
        multi(rounds("집회 전")),
        when("TRANSPORT_IN", "opt_shuttle"),
      );
    }
    if (transport.car) {
      const offers: ShowWhen = { fieldId: idOf("CARPOOL_OFFER"), equals: true };
      add("CARPOOL_OFFER", "동승자를 태울 수 있어요?", null, "YES_NO", true, { style: "YES_NO", yesLabel: null, noLabel: null }, when("TRANSPORT_IN", "opt_car"));
      add("CARPOOL_SEATS", "몇 명까지 태울 수 있어요?", null, "NUMBER", true, { min: 1, max: 10, unit: "명" }, offers);
      add("CARPOOL_AREA", "어느 동네에서 태울 수 있어요?", null, "SHORT_TEXT", true, shortText(100), offers);
      add("CARPOOL_NOTE", "경유할 수 있는 지역이나 전할 말이 있나요?", null, "LONG_TEXT", false, longText(), offers);
    }
    if (transport.support) {
      add("MOBILITY_IN", "갈 때 어느 동네에서 타면 편해요?", SUPPORT_NOTICE, "SHORT_TEXT", true, shortText(100), when("TRANSPORT_IN", "opt_support"));
    }
    if (transport.groupBus || shuttle || transport.publicTransit || transport.support) {
      add(
        "TRANSPORT_OUT",
        "수련회장에서 어떻게 돌아가세요?",
        null,
        "SINGLE_CHOICE",
        true,
        single(
          [
            option("opt_group", "단체 이동 차량", { hidden: !transport.groupBus, showWhen: busOut }),
            option("opt_shuttle", "집회 차량", { hidden: !shuttle, showWhen: shuttleOut }),
            option("opt_public", "대중교통", { hidden: !transport.publicTransit }),
            option("opt_support", "이동 지원 요청", { hidden: !transport.support }),
          ],
          false,
        ),
        when("TRANSPORT_IN", "opt_group", "opt_shuttle", "opt_public", "opt_support"),
      );
      if (shuttle) {
        add(
          "SHUTTLE_OUT",
          "오는 집회 차량은 언제 타세요?",
          "수련회장에서 교회로 돌아오는 차량입니다. 타는 날을 모두 골라주세요.",
          "MULTI_CHOICE",
          true,
          multi(rounds("집회 후")),
          when("TRANSPORT_OUT", "opt_shuttle"),
        );
      }
      if (transport.support) {
        add("MOBILITY_OUT", "올 때 어느 동네에서 내리면 편해요?", SUPPORT_NOTICE, "SHORT_TEXT", true, shortText(100), when("TRANSPORT_OUT", "opt_support"));
      }
    }
  }

  add(
    "CONSENT",
    "개인정보 수집·이용에 동의합니다",
    "입력한 정보는 신청 접수와 행사 운영(조 배정, 숙박·식사·이동 준비, 현장 확인)에만 사용합니다.",
    "YES_NO",
    true,
    { style: "CONSENT", yesLabel: null, noLabel: null },
    null,
  );
  return out;
}
