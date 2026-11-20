import { Link } from "react-router";
import { EmptyNote, HomeCard } from "../HomeCard";
import { useParticipantNoticeList } from "../noticeQuery";
import { ParticipantNoticeRow } from "../NoticesTab";
import { useParticipantFeed } from "../participantFeed";
import { participantPath } from "../participantTabs";

/**
 * 최신 공지 (§1, D4): every pinned notice and the latest two others. Shares the 공지 tab's first
 * page, so it reloads on `updates.notices` and `updates.group` with no request of its own.
 */
export function LatestNoticesCard() {
  const { eventId } = useParticipantFeed();
  const list = useParticipantNoticeList(eventId);
  const first = list.data?.pages[0]?.items ?? [];
  const shown = [...first.filter((item) => item.pinned), ...first.filter((item) => !item.pinned).slice(0, 2)];
  let body;
  if (!list.data) body = <EmptyNote>{list.isError ? "공지를 불러오지 못했어요." : "불러오는 중이에요."}</EmptyNote>;
  else if (shown.length === 0) body = <EmptyNote>공지가 올라오면 여기에 보여요.</EmptyNote>;
  else {
    body = (
      <ul className="notices__rows">
        {shown.map((notice) => (
          <li key={notice.noticeId}>
            <ParticipantNoticeRow eventId={eventId} notice={notice} compact />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <HomeCard
      title="최신 공지"
      failed={list.isError && Boolean(list.data)}
      action={
        <Link className="participant-card__link" to={participantPath(eventId, "notices")}>
          전체 보기
        </Link>
      }
    >
      {body}
    </HomeCard>
  );
}
