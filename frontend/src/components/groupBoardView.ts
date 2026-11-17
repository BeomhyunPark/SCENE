import type { Attendance, AttendanceSlot, BoardParticipant, Group, SlotMeal } from "../api/groups";
import { compareCohort } from "./cohort";

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
  /** "yes" · "no" · NO_ANSWER · ANY */
  newcomer: string;
  assignment: AssignmentFilter;
};

export const EMPTY_FILTERS: GroupFilters = {
  q: "",
  gender: ANY,
  cohort: ANY,
  attendance: ANY,
  middleGroup: ANY,
  cell: ANY,
  newcomer: ANY,
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
    filters.cell !== ANY ||
    filters.newcomer !== ANY
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
    matchValue(person.cell, filters.cell) &&
    matchValue(person.newcomer === null ? null : person.newcomer ? "yes" : "no", filters.newcomer)
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

/** Options present in the data, with "응답 없음" last when someone has no answer. 또래 sorts by birth year (cohort.ts). */
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
    newcomer: [
      { value: "yes", label: "예", count: participants.filter((person) => person.newcomer === true).length },
      { value: "no", label: "아니오", count: participants.filter((person) => person.newcomer === false).length },
      { value: NO_ANSWER, label: NO_ANSWER_LABEL, count: participants.filter((person) => person.newcomer === null).length },
    ].filter((option) => option.count > 0),
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
    numeric ? compareCohort(a.value, b.value) : a.label.localeCompare(b.label, "ko"),
  );
  return none > 0 ? [...sorted, { value: NO_ANSWER, label: NO_ANSWER_LABEL, count: none }] : sorted;
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
/** Members in the operator order (#343): position, then participantId. The leader is not moved to the top. */
export function membersOf(participants: BoardParticipant[], groupId: string): BoardParticipant[] {
  return participants
    .filter((person) => person.groupId === groupId)
    .sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        (a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0),
    );
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

/* ── 참석 칸 (#318, DEC-072 Follow-up #315) ─────────────────────────────────────────────────── */

const MEAL_SHORT: Record<SlotMeal, string> = { BREAKFAST: "아", LUNCH: "점", DINNER: "저", WORSHIP: "집" };

/** One-letter column label (아·점·저·집); the full name goes in title and screen-reader text. */
export function slotShortLabel(slot: AttendanceSlot): string {
  return MEAL_SHORT[slot.meal];
}

/** "1월 22일 (금) 저녁" */
export function slotFullLabel(slot: AttendanceSlot): string {
  return `${slot.dayLabel} ${slot.label}`;
}

/** Consecutive slots of one day, for the first header row. `short` is "1/22" from the date, else "n일차". */
export function slotDays(slots: AttendanceSlot[]): { day: number; label: string; short: string; count: number }[] {
  const days: { day: number; label: string; short: string; count: number }[] = [];
  for (const slot of slots) {
    const last = days.at(-1);
    if (last && last.day === slot.day) last.count += 1;
    else days.push({ day: slot.day, label: slot.dayLabel, short: shortDate(slot), count: 1 });
  }
  return days;
}

function shortDate(slot: AttendanceSlot): string {
  const match = slot.date ? /^\d{4}-(\d{2})-(\d{2})$/.exec(slot.date) : null;
  return match ? `${Number(match[1])}/${Number(match[2])}` : `${slot.day}일차`;
}

/** Continuous runs of attended slots as [start, end] indexes into `slots` (the retreat app's segments). */
export function slotRuns(slots: AttendanceSlot[], slotIds: string[]): { start: number; end: number }[] {
  const attended = new Set(slotIds);
  const runs: { start: number; end: number }[] = [];
  slots.forEach((slot, index) => {
    if (!attended.has(slot.slotId)) return;
    const last = runs.at(-1);
    if (last && last.end === index - 1) last.end = index;
    else runs.push({ start: index, end: index });
  });
  return runs;
}

/** Screen-reader text of a bar: "참석 1월 22일 (금) 저녁–1월 23일 (토) 점심, …" or "참석 칸 없음". */
export function slotRunsText(slots: AttendanceSlot[], slotIds: string[]): string {
  const runs = slotRuns(slots, slotIds);
  if (runs.length === 0) return "참석 칸 없음";
  if (runs.length === 1 && runs[0].start === 0 && runs[0].end === slots.length - 1) return "모든 칸 참석";
  return `참석 ${runs
    .map((run) =>
      run.start === run.end ? slotFullLabel(slots[run.start]) : `${slotFullLabel(slots[run.start])}–${slotFullLabel(slots[run.end])}`,
    )
    .join(", ")}`;
}

/**
 * People per slot among `members`, from their slotIds. "모름" (null) is not counted in any slot but in
 * `unknown`. Summed over every group and 미배정, each slot equals the summary's count for that slot.
 */
export function slotHeadcount(slots: AttendanceSlot[], members: Pick<BoardParticipant, "slotIds">[]): { counts: number[]; unknown: number } {
  const index = new Map(slots.map((slot, position) => [slot.slotId, position]));
  const counts = slots.map(() => 0);
  let unknown = 0;
  for (const member of members) {
    if (member.slotIds === null) {
      unknown += 1;
      continue;
    }
    for (const id of new Set(member.slotIds)) {
      const position = index.get(id);
      if (position !== undefined) counts[position] += 1;
    }
  }
  return { counts, unknown };
}
