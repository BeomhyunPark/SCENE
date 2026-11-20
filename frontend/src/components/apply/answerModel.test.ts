import { describe, expect, it } from "vitest";
import type { FieldConfig, FormField, ShowWhen } from "../../api/forms";
import { problemFor, prune, toAnswerItems, toRawAnswers, visibleFields, visibleOptions } from "./answerModel";

function field(
  fieldId: string,
  answerType: FormField["answerType"],
  config: FieldConfig = {},
  extra: Partial<FormField> = {},
): FormField {
  return {
    fieldId,
    kind: "CUSTOM",
    systemKey: null,
    label: fieldId,
    position: 0,
    answerType,
    required: false,
    description: null,
    config,
    showWhen: null,
    hidden: false,
    presetKey: null,
    presetActive: null,
    ...extra,
  };
}

function option(optionId: string, showWhen: ShowWhen | null = null, hidden = false) {
  return { optionId, label: optionId, group: null, hidden, showWhen };
}

const attendance = field("attendance", "SINGLE_CHOICE", { options: [option("full"), option("partial")] }, { required: true });
const car = field("car", "YES_NO", { style: "YES_NO" }, { showWhen: { fieldId: "attendance", optionIds: ["partial"] } });
const seats = field("seats", "NUMBER", { min: 1, max: 4 }, { required: true, showWhen: { fieldId: "car", equals: true } });
const transport = field("transport", "DROPDOWN", {
  options: [option("bus", { fieldId: "attendance", optionIds: ["full"] }), option("own"), option("old", null, true)],
});
const fields = [attendance, car, seats, transport];

describe("answer model", () => {
  it("shows questions in order as earlier answers allow", () => {
    expect(visibleFields(fields, {}).map((item) => item.fieldId)).toEqual(["attendance", "transport"]);
    const partial = { attendance: { optionId: "partial" } };
    expect(visibleFields(fields, partial).map((item) => item.fieldId)).toEqual(["attendance", "car", "transport"]);
    const driving = { ...partial, car: { bool: true } };
    expect(visibleFields(fields, driving).map((item) => item.fieldId)).toEqual(["attendance", "car", "seats", "transport"]);
  });

  it("filters hidden and conditional options", () => {
    expect(visibleOptions(transport, fields, { attendance: { optionId: "partial" } }).map((item) => item.optionId)).toEqual([
      "own",
    ]);
    expect(visibleOptions(transport, fields, { attendance: { optionId: "full" } }).map((item) => item.optionId)).toEqual([
      "bus",
      "own",
    ]);
  });

  it("prunes answers that are no longer shown", () => {
    const pruned = prune(fields, {
      attendance: { optionId: "full" },
      car: { bool: true },
      seats: { number: "2" },
      transport: { optionId: "bus" },
    });
    expect(pruned).toEqual({ attendance: { optionId: "full" }, transport: { optionId: "bus" } });
    const switched = prune(fields, { ...pruned, attendance: { optionId: "partial" } });
    expect(switched.transport?.optionId).toBeUndefined();
  });

  it("builds request items with the text shortcut and typed values", () => {
    const name = field("name", "SHORT_TEXT", { maxLength: 200, format: "NONE" }, { kind: "SYSTEM", systemKey: "NAME" });
    expect(
      toAnswerItems([name, ...fields], {
        name: { text: "  김  " },
        attendance: { optionId: "partial" },
        car: { bool: true },
        seats: { number: "3" },
      }),
    ).toEqual([
      { fieldId: "name", text: "김" },
      { fieldId: "attendance", value: { optionId: "partial" } },
      { fieldId: "car", value: { value: true } },
      { fieldId: "seats", value: { number: 3 } },
    ]);
  });

  it("explains problems the server would reject", () => {
    expect(problemFor(attendance, undefined)).toBe("꼭 골라 주세요.");
    expect(problemFor(seats, { number: "5" })).toBe("1–4 사이로 적어 주세요.");
    expect(problemFor(seats, { number: "1.5" })).toBe("정수로 적어 주세요.");
    const phone = field("phone", "SHORT_TEXT", { maxLength: 50, format: "PHONE" });
    expect(problemFor(phone, { text: "12" })).toBe("전화번호는 숫자 4개 이상이 필요해요.");
    const meals = field("meals", "MULTI_CHOICE", { options: [option("a"), option("b"), option("c")], minSelect: 1, maxSelect: 2 });
    expect(problemFor(meals, { optionIds: ["a", "b", "c"] })).toBe("2개까지 고를 수 있어요.");
    const consent = field("consent", "YES_NO", { style: "CONSENT" }, { required: true });
    expect(problemFor(consent, { bool: false })).toBe("동의해야 신청할 수 있어요.");
    const stay = field("stay", "DATE_RANGE", { includeTime: false, min: "2027-01-22", max: "2027-01-24" });
    expect(problemFor(stay, { start: "2027-01-23" })).toBe("시작과 끝을 모두 골라 주세요.");
    expect(problemFor(stay, { start: "2027-01-24", end: "2027-01-22" })).toBe("끝이 시작보다 빠를 수 없어요.");
    expect(problemFor(stay, { start: "2027-01-21", end: "2027-01-22" })).toBe("2027-01-22부터 2027-01-24까지 고를 수 있어요.");
  });
  it("takes exactly two digits for 또래", () => {
    const cohort = field("cohort", "SHORT_TEXT", { maxLength: 2, format: "DIGITS", placeholder: "예: 94" }, {
      kind: "SYSTEM",
      systemKey: "COHORT",
      required: true,
    });
    expect(problemFor(cohort, { text: "94" })).toBeNull();
    expect(problemFor(cohort, { text: "00" })).toBeNull();
    expect(problemFor(cohort, { text: "9" })).toContain("두 자리");
    expect(problemFor(cohort, { text: "9a" })).not.toBeNull();
    expect(problemFor(cohort, {})).not.toBeNull();
  });
});

describe("toRawAnswers (#427)", () => {
  it("turns stored answers back into inputs that submit the same values", () => {
    const fields = [
      field("t", "SHORT_TEXT"),
      field("s", "SINGLE_CHOICE", { options: [option("a")], allowOther: true }),
      field("m", "MULTI_CHOICE", { options: [option("a"), option("b")], allowOther: true }),
      field("d", "DATE"),
      field("r", "DATE_RANGE"),
      field("n", "NUMBER"),
      field("y", "YES_NO"),
    ];
    const stored = [
      { fieldId: "t", value: { text: "김" } },
      { fieldId: "s", value: { other: "직접" } },
      { fieldId: "m", value: { optionIds: ["a", "b"], other: "또" } },
      { fieldId: "d", value: { date: "2027-01-22" } },
      { fieldId: "r", value: { start: "2027-01-22", end: "2027-01-24" } },
      { fieldId: "n", value: { number: 3 } },
      { fieldId: "y", value: { value: false } },
      { fieldId: "gone", value: { text: "x" } },
    ];
    const raw = toRawAnswers(fields, stored);
    expect(Object.keys(raw)).not.toContain("gone");
    expect(toAnswerItems(fields, raw)).toEqual([
      { fieldId: "t", text: "김" },
      ...stored.slice(1, 7).map(({ fieldId, value }) => ({ fieldId, value })),
    ]);
  });
});
