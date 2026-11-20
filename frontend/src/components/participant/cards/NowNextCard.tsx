import { EmptyNote, HomeCard } from "../HomeCard";

/**
 * 지금·다음 일정 (§1, §6). C5 replaces the body: read `GET /participant/schedule` under
 * `queryKeys.participantSchedule(eventId)` with `participantCardQuery` (it then reloads on
 * `updates.schedule` and `updates.group`), and compute now/next from `serverNow(useParticipantFeed())`
 * so a wrong phone clock is corrected by the last `serverTime`. Until then the area is on but empty.
 */
export function NowNextCard() {
  return (
    <HomeCard title="지금·다음 일정">
      <EmptyNote>일정이 올라오면 여기에 보여요.</EmptyNote>
    </HomeCard>
  );
}
