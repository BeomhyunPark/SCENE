import { describe, expect, it } from "vitest";
import type { ApplicationAnswer } from "../api/applications";
import type { AnswerType, FieldConfig } from "../api/forms";
import { answerLabel, formatAnswer } from "./answerDisplay";

function answer(answerType: AnswerType, value: Record<string, unknown>, config: FieldConfig = {}, hidden = false) {
  return {
    fieldId: "f1",
    kind: "CUSTOM",
    systemKey: null,
    label: "질문",
    position: 2,
    answerType,
    hidden,
    config,
    value,
  } satisfies ApplicationAnswer;
}

const options: FieldConfig = {
  options: [
    { optionId: "opt_a", label: "전체 참석", group: null, hidden: false, showWhen: null },
    { optionId: "opt_b", label: "부분 참석", group: null, hidden: true, showWhen: null },
  ],
};

describe("formatAnswer", () => {
  it("shows text answers and an empty one as no answer", () => {
    expect(formatAnswer(answer("SHORT_TEXT", { text: "김" }))).toBe("김");
    expect(formatAnswer(answer("LONG_TEXT", { text: "" }))).toBe("답변 없음");
  });

  it("turns option ids into the current option text and marks a hidden option", () => {
    expect(formatAnswer(answer("SINGLE_CHOICE", { optionId: "opt_a" }, options))).toBe("전체 참석");
    expect(formatAnswer(answer("DROPDOWN", { optionId: "opt_b" }, options))).toBe("부분 참석 (숨김)");
    expect(formatAnswer(answer("SINGLE_CHOICE", { other: "늦게 도착" }, options))).toBe("기타: 늦게 도착");
    expect(formatAnswer(answer("MULTI_CHOICE", { optionIds: ["opt_a", "opt_b"], other: "간식" }, options))).toBe(
      "전체 참석, 부분 참석 (숨김), 기타: 간식",
    );
    expect(formatAnswer(answer("SINGLE_CHOICE", { optionId: "opt_gone" }, options))).toBe("알 수 없는 보기");
  });

  it("shows an option's group so a meal names its day", () => {
    const meals: FieldConfig = {
      options: [
        { optionId: "opt_d1_worship", label: "집회", group: "1월 22일 (금)", hidden: false, showWhen: null },
        { optionId: "opt_d2_lunch", label: "점심", group: "1월 23일 (토)", hidden: true, showWhen: null },
      ],
    };
    expect(formatAnswer(answer("MULTI_CHOICE", { optionIds: ["opt_d1_worship", "opt_d2_lunch"] }, meals))).toBe(
      "1월 22일 (금) 집회, 1월 23일 (토) 점심 (숨김)",
    );
  });

  it("shows dates, ranges and numbers without shifting the stored local time", () => {
    expect(formatAnswer(answer("DATE", { date: "2027-01-22" }))).toBe("2027. 1. 22.");
    expect(formatAnswer(answer("DATE", { dateTime: "2027-01-22T19:30" }))).toBe("2027. 1. 22. 19:30");
    expect(formatAnswer(answer("DATE_RANGE", { start: "2027-01-22", end: "2027-01-24" }))).toBe(
      "2027. 1. 22. ~ 2027. 1. 24.",
    );
    expect(formatAnswer(answer("NUMBER", { number: 3 }, { unit: "명" }))).toBe("3 명");
    expect(formatAnswer(answer("NUMBER", { number: 0 }))).toBe("0");
  });

  it("uses yes/no labels, consent wording, and the defaults", () => {
    expect(formatAnswer(answer("YES_NO", { value: true }))).toBe("예");
    expect(formatAnswer(answer("YES_NO", { value: false }, { noLabel: "안 탐" }))).toBe("안 탐");
    expect(formatAnswer(answer("YES_NO", { value: true }, { style: "CONSENT" }))).toBe("동의함");
  });

  it("falls back to stored text when the shape does not match the type", () => {
    expect(formatAnswer(answer("SINGLE_CHOICE", { text: "예전 답" }))).toBe("예전 답");
    expect(formatAnswer(answer("NUMBER", {}))).toBe("답변 없음");
  });
});

describe("answerLabel", () => {
  it("marks a hidden question", () => {
    expect(answerLabel(answer("SHORT_TEXT", { text: "x" }))).toBe("질문");
    expect(answerLabel(answer("SHORT_TEXT", { text: "x" }, {}, true))).toBe("질문 (숨김)");
  });
});
