import { describe, expect, it } from "vitest";
import { participantLabel } from "./participantLabel";

describe("participantLabel", () => {
  it("puts 또래 before 이름", () => {
    expect(participantLabel({ name: "박범현", cohort: "94" })).toBe("94 박범현");
  });

  it("is the name alone without a 또래", () => {
    expect(participantLabel({ name: "정민호", cohort: null })).toBe("정민호");
    expect(participantLabel({ name: "정민호", cohort: "  " })).toBe("정민호");
  });
});
