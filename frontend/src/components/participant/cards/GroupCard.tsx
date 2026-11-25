import { Link } from "react-router";
import { useParticipantGroupQuery } from "../groupQuery";
import { EmptyNote, HomeCard } from "../HomeCard";
import { useParticipantFeed } from "../participantFeed";
import { participantPath } from "../participantTabs";

/**
 * 내 조 summary (§1): group name and leader names; the whole card opens the 내 조 tab. A leader gets
 * the "조원 현황" shortcut with the 미도착 count (F3). Same query as the tab, so no second request.
 */
export function GroupCard() {
  const { eventId } = useParticipantFeed();
  const query = useParticipantGroupQuery(eventId);
  const to = participantPath(eventId, "group");
  const data = query.data;
  if (data?.status === "NOT_ELIGIBLE") return null;

  let body;
  if (!data) {
    body = <EmptyNote>{query.isError ? "내 조를 불러오지 못했어요." : "불러오는 중이에요."}</EmptyNote>;
  } else if (data.status === "NOT_PUBLISHED") {
    body = <EmptyNote>조가 공개되면 여기에 보여요.</EmptyNote>;
  } else if (data.status === "UNASSIGNED" || !data.group) {
    body = <EmptyNote>아직 조가 정해지지 않았어요.</EmptyNote>;
  } else {
    const leaders = data.group.leaders.map((item) => item.name).filter((item) => item.trim().length > 0);
    body = (
      <>
        <p className="participant-card__event">{data.group.name}</p>
        <p className="participant-card__meta">
          {leaders.length > 0 ? `조장 ${leaders.join(", ")}` : "조장은 아직 정해지지 않았어요"}
        </p>
        {data.leader ? (
          <Link className="participant-card__link" to={to}>
            조원 현황{data.leaderView ? ` · 미도착 ${data.leaderView.activeCount - data.leaderView.checkedInCount}명` : ""}
          </Link>
        ) : null}
      </>
    );
  }
  return (
    <HomeCard
      title="내 조"
      failed={query.isError && Boolean(data)}
      action={
        <Link className="participant-card__link" to={to} aria-label="내 조 자세히 보기">
          자세히
        </Link>
      }
    >
      {body}
    </HomeCard>
  );
}
