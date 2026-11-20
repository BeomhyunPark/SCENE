import { EmptyNote } from "./HomeCard";

/**
 * 공지 tab (`/participate/{eventId}/notices`). D4 replaces this file: read `GET /participant/notices`
 * under `queryKeys.participantNotices(eventId)` with `participantCardQuery` from `updateTargets.ts`.
 * A notice detail lives at `notices/{noticeId}`; the route already passes `notices/*` here, so a
 * nested `<Routes>` in this file can add it.
 */
export function NoticesTab() {
  return (
    <section className="participant-tab" aria-labelledby="participant-notices-title">
      <h1 id="participant-notices-title" className="participant-tab__title">
        공지
      </h1>
      <EmptyNote>공지가 올라오면 여기에 보여요.</EmptyNote>
    </section>
  );
}
