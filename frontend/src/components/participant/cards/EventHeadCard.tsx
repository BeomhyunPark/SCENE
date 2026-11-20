import { reloadQuery } from "../../../api/queryClient";
import { Button } from "../../Button";
import { eventContext } from "../../eventFormat";
import { EmptyNote, HomeCard } from "../HomeCard";
import { useParticipantHomeQuery } from "../homeQuery";
import { useParticipantFeed } from "../participantFeed";

/** 행사 머리: name, dates, place, and the completion notice folded (§1). Ended events say so. */
export function EventHeadCard() {
  const { eventId, name } = useParticipantFeed();
  const query = useParticipantHomeQuery(eventId);
  const greeting = name.length > 0 ? `${name}님, 참가 신청이 됐어요.` : "참가 신청이 됐어요.";

  if (!query.data) {
    return (
      <HomeCard title="행사" failed={query.isError}>
        <p className="participant-card__greeting">{greeting}</p>
        {query.isError ? (
          <>
            <EmptyNote>행사 정보를 불러오지 못했어요.</EmptyNote>
            <Button type="button" variant="secondary" size={40} loading={query.isFetching} onClick={() => void reloadQuery(query)}>
              다시 시도
            </Button>
          </>
        ) : (
          <EmptyNote>불러오는 중이에요.</EmptyNote>
        )}
      </HomeCard>
    );
  }

  const { event, completionNotice } = query.data;
  const context = eventContext(event);
  const ended = event.status === "ENDED" || event.status === "ARCHIVED";
  return (
    <HomeCard title="행사" failed={query.isError} className="participant-card--head">
      <p className="participant-card__greeting">{greeting}</p>
      <p className="participant-card__event">{event.name}</p>
      {context ? <p className="participant-card__meta">{context}</p> : null}
      {ended ? (
        <p className="participant-card__ended" role="status">
          행사가 끝났어요
        </p>
      ) : null}
      {completionNotice ? (
        <details className="participant-card__notice">
          <summary>신청 안내 보기</summary>
          <p className="participant-card__notice-text">{completionNotice}</p>
        </details>
      ) : null}
    </HomeCard>
  );
}
