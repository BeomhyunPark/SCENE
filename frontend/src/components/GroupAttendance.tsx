import type { Attendance } from "../api/groups";

/**
 * Where per-slot attendance will go on the 조 편성 board (follow-up to #301). The retreat source drew, for
 * every member, the continuous runs of slots (날짜별 집회·식사) they attend, and each group card ended with
 * a 시간대별 인원 row. group-board does not send slot definitions or per-person slots yet, so both render
 * nothing today and the screen shows only the ATTENDANCE tag. Nothing here invents slots.
 */
export type AttendanceSlot = {
  slotId: string;
  /** ISO date the slot belongs to; the header groups slots by it (MM/DD). */
  date: string;
  /** Slot name as the form shows it, such as "저녁 집회" or "아침". */
  label: string;
  kind: "PROGRAM" | "MEAL";
};

export function AttendanceTimeline({
  slots,
  attendedSlotIds,
  attendance,
}: {
  /** Ordered slots of the event, or null while the server does not send them. */
  slots: AttendanceSlot[] | null;
  /** Slots this person attends, or null when unknown. FULL attendance means every slot. */
  attendedSlotIds: string[] | null;
  attendance: Attendance;
}) {
  if (!slots || slots.length === 0) return null;
  const attended = attendance === "FULL" ? new Set(slots.map((slot) => slot.slotId)) : new Set(attendedSlotIds ?? []);
  return (
    <span className="event-groups__timeline" aria-hidden="true">
      {slots.map((slot) => (
        <span
          key={slot.slotId}
          className={`event-groups__timeline-cell${attended.has(slot.slotId) ? ` event-groups__timeline-cell--${attendance.toLowerCase()}` : ""}`}
        />
      ))}
    </span>
  );
}

export function SlotHeadcount({
  slots,
  members,
}: {
  slots: AttendanceSlot[] | null;
  /** Per member, the same values AttendanceTimeline takes. FULL counts in every slot; unknown counts in none. */
  members: { attendance: Attendance; attendedSlotIds: string[] | null }[];
}) {
  if (!slots || slots.length === 0) return null;
  return (
    <p className="event-groups__headcount">
      시간대별 인원{" "}
      {slots
        .map((slot) => `${slot.label} ${members.filter((member) => member.attendance === "FULL" || (member.attendedSlotIds ?? []).includes(slot.slotId)).length}`)
        .join(" · ")}
    </p>
  );
}
