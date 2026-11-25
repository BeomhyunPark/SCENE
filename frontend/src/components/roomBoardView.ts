import type { Lodging, ReviewReason, Room, RoomBoard, RoomChange, RoomParticipant, RoomWarning } from "../api/rooms";
import { compareCohort } from "./cohort";
import { participantLabel } from "./participantLabel";

/** Screen-side filters for 숙소 (DEC-085). The server sends every active participant; the screen narrows. */
export const ANY = "";
export const NO_ANSWER = "__none__";

export type RoomAssignmentFilter = "unassigned" | "assigned" | "review" | "all";

export type RoomFilters = {
  q: string;
  gender: string;
  cohort: string;
  attendance: string;
  lodging: string;
  /** published group id, NO_ANSWER (조 없음) or ANY */
  group: string;
  assignment: RoomAssignmentFilter;
};

export const EMPTY_ROOM_FILTERS: RoomFilters = {
  q: "",
  gender: ANY,
  cohort: ANY,
  attendance: ANY,
  lodging: ANY,
  group: ANY,
  assignment: "unassigned",
};

export const LODGING_LABEL: Record<Lodging, string> = {
  LODGING: "숙박",
  NOT_LODGING: "숙박 안 함",
  UNKNOWN: "숙박 모름",
};

export const REVIEW_LABEL: Record<ReviewReason, string> = {
  NOT_LODGING: "숙박을 뺐어요",
  LODGING_CHANGED: "자는 밤이 바뀌었어요",
  ATTENDANCE_CHANGED: "참석 구간이 바뀌었어요",
  GENDER_CHANGED: "성별 답이 바뀌었어요",
};

export const ROSTER_SCOPE_LABEL = {
  ALL: "전체 방 배정표까지",
  ROOMMATES: "같은 방 사람까지",
  MY_ROOM: "내 방 이름·위치만",
} as const;

export function hasAnswerFilter(filters: RoomFilters): boolean {
  return (
    filters.q.trim().length > 0 ||
    [filters.gender, filters.cohort, filters.attendance, filters.lodging, filters.group].some((value) => value !== ANY)
  );
}

export function matchesAnswers(person: RoomParticipant, filters: RoomFilters): boolean {
  const q = filters.q.trim().toLowerCase();
  if (q && !participantLabel(person).toLowerCase().includes(q)) return false;
  return (
    match(person.gender?.optionId ?? null, filters.gender) &&
    match(person.cohort, filters.cohort) &&
    (filters.attendance === ANY || person.attendance === filters.attendance) &&
    (filters.lodging === ANY || person.lodging === filters.lodging) &&
    match(person.group?.groupId ?? null, filters.group)
  );
}

export function matchesFilters(person: RoomParticipant, filters: RoomFilters): boolean {
  if (filters.assignment === "unassigned" && person.roomId !== null) return false;
  if (filters.assignment === "assigned" && person.roomId === null) return false;
  if (filters.assignment === "review" && person.review === null) return false;
  return matchesAnswers(person, filters);
}

function match(value: string | null, wanted: string): boolean {
  if (wanted === ANY) return true;
  if (wanted === NO_ANSWER) return value === null;
  return value === wanted;
}

type Option = { value: string; label: string; count: number };

export function filterOptions(board: RoomBoard): {
  gender: Option[];
  cohort: Option[];
  lodging: Option[];
  group: Option[];
} {
  const people = board.participants;
  const counted = (pick: (person: RoomParticipant) => { value: string; label: string } | null) => {
    const map = new Map<string, Option>();
    for (const person of people) {
      const item = pick(person) ?? { value: NO_ANSWER, label: "응답 없음" };
      const found = map.get(item.value);
      if (found) found.count += 1;
      else map.set(item.value, { ...item, count: 1 });
    }
    return [...map.values()];
  };
  const gender = counted((person) => (person.gender ? { value: person.gender.optionId, label: person.gender.label } : null));
  const cohort = counted((person) => (person.cohort ? { value: person.cohort, label: person.cohort } : null)).sort((a, b) =>
    a.value === NO_ANSWER ? 1 : b.value === NO_ANSWER ? -1 : compareCohort(a.value, b.value),
  );
  const lodging = (["LODGING", "UNKNOWN", "NOT_LODGING"] as const).flatMap((value) => {
    const count = people.filter((person) => person.lodging === value).length;
    return count > 0 ? [{ value, label: LODGING_LABEL[value], count }] : [];
  });
  const groupCounts = new Map<string, number>();
  let noGroup = 0;
  for (const person of people) {
    if (person.group) groupCounts.set(person.group.groupId, (groupCounts.get(person.group.groupId) ?? 0) + 1);
    else noGroup += 1;
  }
  const group = board.groups
    .filter((item) => groupCounts.has(item.groupId))
    .map((item) => ({ value: item.groupId, label: item.name, count: groupCounts.get(item.groupId)! }));
  if (board.groups.length > 0 && noGroup > 0) group.push({ value: NO_ANSWER, label: "조 없음", count: noGroup });
  return { gender, cohort, lodging, group };
}

export function membersOfRoom(people: RoomParticipant[], roomId: string): RoomParticipant[] {
  return people
    .filter((person) => person.roomId === roomId)
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.participantId.localeCompare(b.participantId));
}

export function roomName(rooms: Room[], roomId: string | null, fallback = "지워진 방"): string {
  if (roomId === null) return "미배정";
  return rooms.find((room) => room.roomId === roomId)?.name ?? fallback;
}

/** "1·2박째" style text of the nights someone sleeps over; 모름 / 숙박 안 함 otherwise. */
export function nightsText(person: Pick<RoomParticipant, "lodging" | "lodgingNights">): string {
  if (person.lodging === "NOT_LODGING") return "숙박 안 함";
  if (!person.lodgingNights || person.lodgingNights.length === 0) return "숙박 모름";
  return `${person.lodgingNights.join("·")}박째`;
}

export function warningText(warning: RoomWarning): string {
  const people = warning.participantIds?.length ?? 0;
  switch (warning.code) {
    case "OVER_CAPACITY":
      return `정원 초과 ${warning.count ?? "?"}/${warning.capacity ?? "?"}`;
    case "GENDER_MISMATCH":
      return `성별 다름 ${people}명`;
    case "GENDER_UNKNOWN":
      return `성별 모름 ${people}명`;
    case "NOT_LODGING":
      return `숙박 안 함 ${people}명`;
  }
}

/** Short text of the rooms that came back with warnings from an assignment, for the success notice. */
export function warningSummary(rooms: Room[], states: { roomId: string; warnings: RoomWarning[] }[]): string {
  const parts = states
    .filter((state) => state.warnings.length > 0)
    .map((state) => `${roomName(rooms, state.roomId)} ${state.warnings.map(warningText).join(", ")}`);
  return parts.length > 0 ? ` 확인할 방: ${parts.join(" · ")}.` : "";
}

/**
 * The changes that put `ids` in `toRoomId` (null unassigns), with the room each person was in on this screen. People
 * already there are left out; people who do not sleep over are left out of a move into a room and returned in
 * `notLodging` so the screen can say so (the server would refuse the whole request).
 */
export function planRoomMove(
  people: RoomParticipant[],
  ids: string[],
  toRoomId: string | null,
): { changes: RoomChange[]; notLodging: RoomParticipant[] } {
  const byId = new Map(people.map((person) => [person.participantId, person]));
  const changes: RoomChange[] = [];
  const notLodging: RoomParticipant[] = [];
  for (const id of ids) {
    const person = byId.get(id);
    if (!person || person.roomId === toRoomId) continue;
    if (toRoomId !== null && person.lodging === "NOT_LODGING") {
      notLodging.push(person);
      continue;
    }
    changes.push({ participantId: id, fromRoomId: person.roomId, toRoomId });
  }
  return { changes, notLodging };
}

/**
 * 조 단위 일괄 배정 (DEC-085 §5): the active members of a group — the published group, or the group working copy
 * (`draftGroupId`) when the operator has GROUP_WRITE — as one request. The server has no group path.
 */
export function groupMembers(people: RoomParticipant[], groupId: string, source: "published" | "draft"): RoomParticipant[] {
  return people.filter((person) => (source === "draft" ? person.draftGroupId : person.group?.groupId) === groupId);
}

/** The next room name after the last one that ends in a number ("301호" → "302호"), else "방 N". */
export function nextRoomName(rooms: Room[]): string {
  for (let index = rooms.length - 1; index >= 0; index -= 1) {
    const match = /^(.*?)(\d+)(\D*)$/.exec(rooms[index].name);
    if (match) {
      const next = String(Number(match[2]) + 1).padStart(match[2].length, "0");
      const name = `${match[1]}${next}${match[3]}`;
      if (!rooms.some((room) => room.name === name)) return name;
    }
  }
  let number = rooms.length + 1;
  while (rooms.some((room) => room.name === `방 ${number}`)) number += 1;
  return `방 ${number}`;
}

/** "301호"…"310호" for a numbered batch; empty when the range is not usable. */
export function numberedRoomNames(prefix: string, from: number, to: number, suffix: string): string[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to - from >= 100) return [];
  const names: string[] = [];
  for (let number = from; number <= to; number += 1) names.push(`${prefix}${number}${suffix}`.trim());
  return names;
}

export function genderTone(optionId: string | null | undefined, options: { value: string; label: string }[]): "male" | "female" | "none" {
  if (!optionId) return "none";
  const label = options.find((option) => option.value === optionId)?.label ?? "";
  if (optionId === "opt_male" || /^남/.test(label)) return "male";
  if (optionId === "opt_female" || /^여/.test(label)) return "female";
  return "none";
}
