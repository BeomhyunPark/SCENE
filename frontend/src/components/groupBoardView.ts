import type { Attendance, BoardParticipant, Group } from "../api/groups";

/** Screen-side filters for 조 편성 (DEC-072 §3). The server sends everyone; the screen narrows. */
export const NO_ANSWER = "__none__";
export const ANY = "";

export type AssignmentFilter = "unassigned" | "assigned" | "all";

export type GroupFilters = {
  q: string;
  gender: string;
  cohort: string;
  attendance: string;
  middleGroup: string;
  cell: string;
  assignment: AssignmentFilter;
};

export const EMPTY_FILTERS: GroupFilters = {
  q: "",
  gender: ANY,
  cohort: ANY,
  attendance: ANY,
  middleGroup: ANY,
  cell: ANY,
  assignment: "unassigned",
};

export const ATTENDANCE_LABEL: Record<Attendance, string> = {
  FULL: "전체 참석",
  PARTIAL: "부분 참석",
  WORSHIP_ONLY: "집회만",
};

export const NO_ANSWER_LABEL = "응답 없음";

type Option = { value: string; label: string; count: number };

/** Answer-based filters only (not search or assignment), so a group card can dim people outside them. */
export function hasAnswerFilter(filters: GroupFilters): boolean {
  return (
    filters.q.trim().length > 0 ||
    filters.gender !== ANY ||
    filters.cohort !== ANY ||
    filters.attendance !== ANY ||
    filters.middleGroup !== ANY ||
    filters.cell !== ANY
  );
}

export function matchesAnswers(person: BoardParticipant, filters: GroupFilters): boolean {
  const q = filters.q.trim().toLowerCase();
  if (q && !person.name.toLowerCase().includes(q) && !`${person.cohort ?? ""} ${person.name}`.toLowerCase().includes(q)) {
    return false;
  }
  return (
    matchValue(person.gender?.optionId ?? null, filters.gender) &&
    matchValue(person.cohort, filters.cohort) &&
    (filters.attendance === ANY || person.attendance === filters.attendance) &&
    matchValue(person.middleGroup, filters.middleGroup) &&
    matchValue(person.cell, filters.cell)
  );
}

export function matchesFilters(person: BoardParticipant, filters: GroupFilters): boolean {
  if (filters.assignment === "unassigned" && person.groupId !== null) return false;
  if (filters.assignment === "assigned" && person.groupId === null) return false;
  return matchesAnswers(person, filters);
}

function matchValue(value: string | null, wanted: string): boolean {
  if (wanted === ANY) return true;
  if (wanted === NO_ANSWER) return value === null;
  return value === wanted;
}

/** Options present in the data, with "응답 없음" last when someone has no answer. 또래 sorts by number. */
export function filterOptions(participants: BoardParticipant[]) {
  return {
    gender: optionsOf(participants, (person) =>
      person.gender ? { value: person.gender.optionId, label: person.gender.label } : null,
    ),
    cohort: optionsOf(participants, (person) => (person.cohort ? { value: person.cohort, label: person.cohort } : null), true),
    attendance: (["FULL", "PARTIAL", "WORSHIP_ONLY"] as const)
      .map((value) => ({
        value,
        label: ATTENDANCE_LABEL[value],
        count: participants.filter((person) => person.attendance === value).length,
      }))
      .filter((option) => option.count > 0),
    middleGroup: optionsOf(participants, (person) =>
      person.middleGroup ? { value: person.middleGroup, label: person.middleGroup } : null,
    ),
    cell: optionsOf(participants, (person) => (person.cell ? { value: person.cell, label: person.cell } : null)),
  };
}

function optionsOf(
  participants: BoardParticipant[],
  pick: (person: BoardParticipant) => { value: string; label: string } | null,
  numeric = false,
): Option[] {
  const found = new Map<string, Option>();
  let none = 0;
  for (const person of participants) {
    const option = pick(person);
    if (!option) {
      none += 1;
      continue;
    }
    const existing = found.get(option.value);
    if (existing) existing.count += 1;
    else found.set(option.value, { ...option, count: 1 });
  }
  const sorted = [...found.values()].sort((a, b) =>
    numeric ? cohortOrder(a.value, b.value) : a.label.localeCompare(b.label, "ko"),
  );
  return none > 0 ? [...sorted, { value: NO_ANSWER, label: NO_ANSWER_LABEL, count: none }] : sorted;
}

function cohortOrder(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, "ko");
}

/** "남 2 · 여 3 · 응답 없음 1": gender labels in the filter order (label order, 응답 없음 last). */
export function genderSummary(members: BoardParticipant[], order: Option[]): string {
  const parts = order
    .map((option) => {
      const count = members.filter((person) =>
        option.value === NO_ANSWER ? person.gender === null : person.gender?.optionId === option.value,
      ).length;
      return count > 0 ? `${option.label} ${count}` : null;
    })
    .filter(Boolean);
  return parts.join(" · ");
}

/** "94 2 · 95 1 · 응답 없음 1", ordered by 또래. */
export function cohortSummary(members: BoardParticipant[]): string {
  return optionsOf(members, (person) => (person.cohort ? { value: person.cohort, label: person.cohort } : null), true)
    .map((option) => `${option.label} ${option.count}`)
    .join(" · ");
}

/** Pills on a group card: "전체 참석 4", "부분 참석 1", "집회만 1" (non-zero only). */
export function attendanceCounts(members: BoardParticipant[]): { value: Attendance; label: string; count: number }[] {
  return (["FULL", "PARTIAL", "WORSHIP_ONLY"] as const)
    .map((value) => ({
      value,
      label: ATTENDANCE_LABEL[value],
      count: members.filter((person) => person.attendance === value).length,
    }))
    .filter((item) => item.count > 0);
}

/** Members of a group, leaders first, then the server's name order. */
export function membersOf(participants: BoardParticipant[], groupId: string): BoardParticipant[] {
  const members = participants.filter((person) => person.groupId === groupId);
  return [...members.filter((person) => person.leader), ...members.filter((person) => !person.leader)];
}

export function groupName(groups: Group[], groupId: string | null, fallback = "지워진 조"): string {
  if (groupId === null) return "미배정";
  return groups.find((group) => group.groupId === groupId)?.name ?? fallback;
}

/** Next free default name: "n조" with the smallest n not taken. */
export function nextGroupName(groups: Group[]): string {
  const taken = new Set(groups.map((group) => group.name));
  for (let index = groups.length + 1; ; index += 1) {
    if (!taken.has(`${index}조`)) return `${index}조`;
  }
}
