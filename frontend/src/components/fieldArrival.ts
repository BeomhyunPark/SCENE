import type { ArrivalSlot, RosterArrival, SummaryArrival } from "../api/checkIns";

/**
 * Words for the arrival standing on 현장 운영 (E4 #456, DEC-089 Follow-up). The server decides the
 * standing with the meal counts' clock, so "왔어야 함" is the same people as 식수 현황's 아직 안 옴.
 */
export type ArrivalTone = "overdue" | "coming" | "muted";

/** "2일차 저녁". */
export function slotText(slot: ArrivalSlot): string {
  return `${slot.day}일차 ${slot.label}`;
}

/** One line under a roster name, or null when the event has no slots. */
export function arrivalLine(arrival: RosterArrival | null): { text: string; tone: ArrivalTone } | null {
  if (!arrival) return null;
  const at = arrival.slot ? slotText(arrival.slot) : null;
  switch (arrival.status) {
    case "OVERDUE":
      return { text: `${at ?? "도착 예정"} 도착 예정 · 왔어야 함`, tone: "overdue" };
    case "COMING":
      return { text: `${at ?? ""} 도착 예정 · 올 예정`.trim(), tone: "coming" };
    case "PASSED":
      return { text: at ? `${at} 도착 예정 · 참석 칸 지남` : "참석 칸 없음", tone: "muted" };
    case "UNKNOWN":
      return { text: "도착 예정 모름", tone: "muted" };
    case "ARRIVED":
      return at ? { text: `${at} 도착 예정`, tone: "muted" } : { text: "도착 예정 모름", tone: "muted" };
  }
}

/** The summary line, e.g. "다음 끼니 2일차 점심 기준". */
export function arrivalBasis(arrival: SummaryArrival): string {
  return arrival.nextMeal ? `다음 끼니 ${slotText(arrival.nextMeal)} 기준` : "모든 끼니가 지났어요";
}
