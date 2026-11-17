import { describe, expect, it } from "vitest";
import type { BoardParticipant } from "../api/groups";
import { EMPTY_FILTERS, NO_ANSWER, cohortSummary, filterOptions, matchesFilters, nextGroupName } from "./groupBoardView";

function person(patch: Partial<BoardParticipant>): BoardParticipant {
  return {
    participantId: crypto.randomUUID(),
    name: "김하늘",
    cohort: null,
    gender: null,
    attendance: "FULL",
    middleGroup: null,
    cell: null,
    groupId: null,
    leader: false,
    publishedGroupId: null,
    publishedLeader: false,
    ...patch,
  };
}

describe("group board view", () => {
  it("orders 또래 by number and puts 응답 없음 last", () => {
    const people = [person({ cohort: "100" }), person({ cohort: "94" }), person({}), person({ cohort: "94" })];
    expect(filterOptions(people).cohort.map((option) => `${option.label}:${option.count}`)).toEqual([
      "94:2",
      "100:1",
      "응답 없음:1",
    ]);
    expect(cohortSummary(people)).toBe("94 2 · 100 1 · 응답 없음 1");
  });

  it("matches 응답 없음 to missing answers only, and the assignment filter to groupId", () => {
    const missing = person({});
    const answered = person({ cell: "다윗셀", groupId: "g1" });
    const filters = { ...EMPTY_FILTERS, cell: NO_ANSWER, assignment: "all" as const };
    expect(matchesFilters(missing, filters)).toBe(true);
    expect(matchesFilters(answered, filters)).toBe(false);
    expect(matchesFilters(answered, { ...EMPTY_FILTERS })).toBe(false);
    expect(matchesFilters(answered, { ...EMPTY_FILTERS, assignment: "assigned", q: "94 김" })).toBe(false);
    expect(matchesFilters(person({ cohort: "94", groupId: "g" }), { ...EMPTY_FILTERS, assignment: "assigned", q: "94 김" })).toBe(true);
  });

  it("suggests the next free n조 name", () => {
    const group = (name: string) => ({ groupId: name, name, sortOrder: 0, version: 0 });
    expect(nextGroupName([])).toBe("1조");
    expect(nextGroupName([group("1조"), group("3조")])).toBe("4조");
    expect(nextGroupName([group("찬양조")])).toBe("2조");
  });
});
