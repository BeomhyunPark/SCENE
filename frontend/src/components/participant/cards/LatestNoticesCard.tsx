import { EmptyNote, HomeCard } from "../HomeCard";

/**
 * 최신 공지: pinned notices and the latest two (§1). D4 replaces the body with a read under
 * `queryKeys.participantNotices(eventId)` and `participantCardQuery`; it then reloads on
 * `updates.notices` and `updates.group`. A "전체 보기" link goes to `participantPath(eventId, "notices")`.
 */
export function LatestNoticesCard() {
  return (
    <HomeCard title="최신 공지">
      <EmptyNote>공지가 올라오면 여기에 보여요.</EmptyNote>
    </HomeCard>
  );
}
