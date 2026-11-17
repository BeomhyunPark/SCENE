import { describe, expect, it } from "vitest";
import type { AttendanceSlot, BoardParticipant } from "../api/groups";
import {
  EMPTY_FILTERS,
  NO_ANSWER,
  cohortSummary,
  filterOptions,
  matchesFilters,
  nextGroupName,
  slotDays,
  slotHeadcount,
  slotRuns,
  slotRunsText,
} from "./groupBoardView";

function person(patch: Partial<BoardParticipant>): BoardParticipant {
  return {
    participantId: crypto.randomUUID(),
    applicationId: null,
    name: "김하늘",
    cohort: null,
    gender: null,
    attendance: "FULL",
    middleGroup: null,
    cell: null,
    newcomer: null,
    groupId: null,
    leader: false,
    publishedGroupId: null,
    publishedLeader: false,
    slotIds: null,
    ...patch,
  };
}

describe("group board view", () => {
  it("orders 또래 by birth year: 98, 99, 00, 01, and the same in a card's distribution", () => {
    const people = [person({ cohort: "01" }), person({ cohort: "99" }), person({ cohort: "00" }), person({ cohort: "98" })];
    expect(filterOptions(people).cohort.map((option) => option.label)).toEqual(["98", "99", "00", "01"]);
    expect(cohortSummary(people)).toBe("98 1 · 99 1 · 00 1 · 01 1");
  });

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

describe("attendance slots (#318)", () => {
  const meals = [
    [1, "DINNER", "저녁"],
    [1, "WORSHIP", "집회"],
    [2, "BREAKFAST", "아침"],
    [2, "LUNCH", "점심"],
    [2, "DINNER", "저녁"],
    [2, "WORSHIP", "집회"],
  ] as const;
  const slots: AttendanceSlot[] = meals.map(([day, meal, label], sortOrder) => ({
    slotId: `opt_d${day}_${meal.toLowerCase()}`,
    day,
    date: `2027-01-${21 + day}`,
    dayLabel: day === 1 ? "1월 22일 (금)" : "1월 23일 (토)",
    meal,
    label,
    sortOrder,
  }));
  const ids = (...indexes: number[]) => indexes.map((index) => slots[index].slotId);

  it("draws continuous runs of attended slots and says them in words", () => {
    expect(slotRuns(slots, ids(0, 1, 2, 3, 4, 5))).toEqual([{ start: 0, end: 5 }]);
    expect(slotRuns(slots, ids(1, 2, 5))).toEqual([{ start: 1, end: 2 }, { start: 5, end: 5 }]);
    expect(slotRuns(slots, [])).toEqual([]);
    expect(slotRunsText(slots, ids(0, 1, 2, 3, 4, 5))).toBe("모든 칸 참석");
    expect(slotRunsText(slots, ids(1, 2, 5))).toBe("참석 1월 22일 (금) 집회–1월 23일 (토) 아침, 1월 23일 (토) 집회");
    expect(slotRunsText(slots, [])).toBe("참석 칸 없음");
  });

  it("groups the header by day with a short date", () => {
    expect(slotDays(slots).map((day) => `${day.short}×${day.count}`)).toEqual(["1/22×2", "1/23×4"]);
  });

  it("counts people per slot, keeps 모름 (null) apart from no slot ([]), and adds up to the summary", () => {
    const groupA = [person({ slotIds: ids(0, 1, 2, 3, 4, 5) }), person({ attendance: "PARTIAL", slotIds: ids(1, 2) })];
    const groupB = [person({ attendance: "WORSHIP_ONLY", slotIds: ids(1, 5) }), person({ attendance: "PARTIAL", slotIds: null })];
    const unassigned = [person({ attendance: "PARTIAL", slotIds: [] })];
    expect(slotHeadcount(slots, groupA)).toEqual({ counts: [1, 2, 2, 1, 1, 1], unknown: 0 });
    expect(slotHeadcount(slots, groupB)).toEqual({ counts: [0, 1, 0, 0, 0, 1], unknown: 1 });
    expect(slotHeadcount(slots, unassigned)).toEqual({ counts: [0, 0, 0, 0, 0, 0], unknown: 0 });
    const everyone = slotHeadcount(slots, [...groupA, ...groupB, ...unassigned]);
    const parts = [groupA, groupB, unassigned].map((members) => slotHeadcount(slots, members).counts);
    expect(everyone.counts).toEqual(slots.map((_, index) => parts.reduce((sum, counts) => sum + counts[index], 0)));
  });
});
