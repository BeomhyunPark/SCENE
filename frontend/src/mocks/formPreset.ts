import type { AnswerType, FieldConfig, FieldOption, FormSetup, ShowWhen } from "../api/forms";

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
  if (setup.middleGroup) {
    add("MIDDLE_GROUP", "중그룹", "소속 중그룹이 있으면 적어주세요.", "SHORT_TEXT", false, shortText(50), null);
  }
  if (setup.cell) add("CELL", "셀", "소속 셀이 있으면 적어주세요.", "SHORT_TEXT", false, shortText(50), null);
  if (setup.newcomer) {
    add(
      "NEWCOMER",
      "새가족이신가요?",
      "교회에 처음 오셨거나 새가족 과정을 듣고 있다면 '예'를 골라주세요. 조 편성에서 더 잘 챙겨 드리려고 여쭤봐요.",
      "YES_NO",
      true,
      { style: "YES_NO", yesLabel: null, noLabel: null },
      null,
    );
  }

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
  if (setup.attendance.partial) {
    const range: FieldConfig = { includeTime: true, min: `${start}T00:00`, max: `${end}T23:59` };
    add("ARRIVAL_AT", "수련회장에 언제 도착할 예정인가요?", null, "DATE", true, range, whenPartial);
    add("DEPARTURE_AT", "수련회장에서 언제 출발할 예정인가요?", null, "DATE", true, { ...range }, whenPartial);
    if (days > 1) {
      const nights = Array.from({ length: days - 1 }, (_, index) =>
        option(`opt_n${index + 1}`, `${ORDINALS[index]} 밤 (${dayLabel(start, index)})`),
      );
      add("LODGING", "숙박하는 밤을 모두 골라주세요", "숙박하지 않으면 비워 두세요.", "MULTI_CHOICE", false, multi(nights), whenPartial);
    }
  }
  const worshipDays: number[] = [];
  if (attendance) {
    const cells: FieldOption[] = [];
    setup.schedule.forEach((slots, index) => {
      const day = index + 1;
      const group = dayLabel(start, index);
      if (slots.breakfast) cells.push(option(`opt_d${day}_breakfast`, "아침", { group }));
      if (slots.lunch) cells.push(option(`opt_d${day}_lunch`, "점심", { group }));
      if (slots.dinner) cells.push(option(`opt_d${day}_dinner`, "저녁", { group }));
      if (slots.worship) cells.push(option(`opt_d${day}_worship`, "집회", { group }));
    });
    if (cells.length > 0) {
      add(
        "MEALS",
        "참석할 프로그램과 식사를 선택해주세요",
        "식수 인원 확인을 위해 식사도 빠짐없이 골라주세요.",
        "MULTI_CHOICE",
        true,
        multi(cells),
        when("ATTENDANCE", "opt_partial", "opt_worship"),
      );
    }
  }
  setup.schedule.forEach((slots, index) => {
    if (slots.worship) worshipDays.push(index + 1);
  });
  if (setup.attendance.partial) {
    add("PARTIAL_NOTE", "운영진이 알아야 할 부분 참석 메모가 있나요?", null, "LONG_TEXT", false, longText(), whenPartial);
  }

  const transport = setup.transport;
  if (transport.groupBus || transport.worshipShuttle || transport.car || transport.publicTransit || transport.support) {
    const shuttle = transport.worshipShuttle && attendance && worshipDays.length > 0;
    const forBus = attendance ? when("ATTENDANCE", "opt_full", "opt_partial") : null;
    const forShuttle = attendance ? when("ATTENDANCE", "opt_partial", "opt_worship") : null;
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
          option("opt_group", "단체 이동 차량", { hidden: !transport.groupBus, showWhen: forBus }),
          option("opt_shuttle", "집회 차량", { hidden: !shuttle, showWhen: forShuttle }),
          option("opt_car", "자차", { hidden: !transport.car }),
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
            option("opt_group", "단체 이동 차량", { hidden: !transport.groupBus, showWhen: forBus }),
            option("opt_shuttle", "집회 차량", { hidden: !shuttle, showWhen: forShuttle }),
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
