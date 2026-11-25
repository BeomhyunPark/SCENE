import type { ParticipantRooms } from "../../api/participantRooms";

/** "박 · 95 · 남성" — only the parts that have a value. */
export function personLine(person: { name: string; cohort: string | null; gender?: string | null }): string {
  return [person.name, person.cohort, person.gender ?? null].filter((part): part is string => Boolean(part)).join(" · ");
}

/** 방 이름 옆의 작은 줄: 위치 메모와 방의 성별 구분. */
export function roomMeta(room: { locationNote: string | null; genderLabel: string | null }): string | null {
  const parts = [room.locationNote, room.genderLabel ? `${room.genderLabel} 방` : null].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The sentence for a state without a room to show (participant-home-contract §1, DEC-085 §9). */
export function roomStateNote(data: ParticipantRooms): string | null {
  switch (data.status) {
    case "NOT_ELIGIBLE":
      return "신청이 접수된 참가자에게 숙소가 보여요.";
    case "NOT_PUBLISHED":
      return "숙소가 정해지면 여기에 보여요.";
    case "UNASSIGNED":
      return data.notLodging ? "숙박하지 않는 것으로 신청했어요. 배정된 방이 없어요." : "숙소를 정하고 있어요. 방이 정해지면 여기에 보여요.";
    case "ASSIGNED":
      return null;
  }
}

/** A room left from before the person changed the application to not stay overnight (DEC-085 Follow-up 결정 대기 7). */
export const NOT_LODGING_ASSIGNED = "숙박하지 않는 것으로 신청했지만 방이 배정되어 있어요. 궁금하면 운영진에게 물어봐 주세요.";
