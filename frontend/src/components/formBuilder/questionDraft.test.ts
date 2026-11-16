import { describe, expect, it } from "vitest";
import { draftProblem, emptyDraft, withAnswerType, withIncludeTime } from "./questionDraft";

const period = { startDate: "2027-01-22", endDate: "2027-01-24" };

describe("withAnswerType", () => {
  it("starts a number question with empty bounds instead of the event dates", () => {
    const draft = withAnswerType({ ...emptyDraft(period), label: "인원" }, "NUMBER", period);
    expect(draft.min).toBe("");
    expect(draft.max).toBe("");
    expect(draftProblem(draft)).toBeNull();
  });

  it("puts the event period back when a number question becomes a date", () => {
    const number = withAnswerType({ ...emptyDraft(period), min: "1", max: "4" }, "NUMBER", period);
    const date = withAnswerType({ ...number, min: "1", max: "4" }, "DATE", period);
    expect(date.min).toBe("2027-01-22");
    expect(date.max).toBe("2027-01-24");
    expect(date.includeTime).toBe(false);
  });

  it("keeps bounds and the time setting between date and date range", () => {
    const date = withIncludeTime(withAnswerType(emptyDraft(period), "DATE", period), true);
    const range = withAnswerType(date, "DATE_RANGE", period);
    expect(range.includeTime).toBe(true);
    expect(range.min).toBe("2027-01-22T00:00");
    expect(range.max).toBe("2027-01-24T23:59");
  });

  it("gives a choice type two empty options", () => {
    expect(withAnswerType(emptyDraft(period), "SINGLE_CHOICE", period).options).toHaveLength(2);
  });
});
