/** What the 신청 상세 reads from an applicant link: the screen to go back to (I6 #348). */
export type ApplicantFrom = { from?: string };

/** The back target of a 신청 상세: the screen of this event it was opened from, else the 참가 현황 list. */
export function applicantBack(state: unknown, eventId: string): string {
  const from = typeof state === "object" && state !== null ? (state as ApplicantFrom).from : undefined;
  const list = `/events/${eventId}/participants`;
  return typeof from === "string" && from.startsWith(`/events/${eventId}/`) ? from : list;
}
