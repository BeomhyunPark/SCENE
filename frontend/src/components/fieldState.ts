import type { CheckInSummary, RosterArrival, RosterItem } from "../api/checkIns";

/**
 * 현장 운영 says one of three words for a person (user decision 2026-11-26, DEC-089 Follow-up 현장 운영):
 * 도착 = checked in, whenever they signed up to come; 도착 예정 = not checked in and the server says their
 * arrival slot is still ahead (`arrival.status` COMING); 미도착 = every other person not checked in.
 * The screen does not work the slots out itself: the server's `arrival` decides 도착 예정.
 */
export type FieldState = "arrived" | "absent" | "expected";

export function fieldState(item: RosterItem): FieldState {
  return arrivalState(item.checkIn?.status === "CHECKED_IN", item.arrival);
}

/** The same rule for anything with a check-in and the server's arrival, such as a 참가 현황 row (DEC-091). */
export function arrivalState(checkedIn: boolean, arrival: RosterArrival | null | undefined): FieldState {
  if (checkedIn) return "arrived";
  return arrival?.status === "COMING" ? "expected" : "absent";
}

/** The three words, in the chips' order: 미도착 first, it is what the desk acts on. */
export const FIELD_STATE_LABELS: readonly (readonly [FieldState, string])[] = [
  ["absent", "미도착"],
  ["expected", "도착 예정"],
  ["arrived", "도착"],
];

/** "2일차 저녁": when a 도착 예정 person comes, or null when the server does not know. */
export function expectedWhen(item: RosterItem): string | null {
  const slot = item.arrival?.slot;
  return fieldState(item) === "expected" && slot ? `${slot.day}일차 ${slot.label}` : null;
}

export type FieldCounts = { all: number; absent: number; expected: number; arrived: number };

/** The chip numbers, from the 체크인 현황 (not the search). */
export function fieldCounts(summary: CheckInSummary): FieldCounts {
  const expected = summary.arrival?.coming ?? 0;
  return {
    all: summary.total,
    absent: summary.notCheckedIn - expected,
    expected,
    arrived: summary.checkedIn,
  };
}
