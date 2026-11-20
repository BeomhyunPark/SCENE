import { EmptyNote } from "./HomeCard";

/**
 * 일정 tab (`/participate/{eventId}/schedule`). C5 replaces this file: read `GET /participant/schedule`
 * under `queryKeys.participantSchedule(eventId)` with `participantCardQuery` from `updateTargets.ts`.
 * Sub-addresses (a day, an item) go under `schedule/…`; the route already passes them here.
 */
export function ScheduleTab() {
  return (
    <section className="participant-tab" aria-labelledby="participant-schedule-title">
      <h1 id="participant-schedule-title" className="participant-tab__title">
        일정
      </h1>
      <EmptyNote>일정이 올라오면 여기에 보여요.</EmptyNote>
    </section>
  );
}
