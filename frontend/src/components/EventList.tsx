import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import calendarPlus from "../assets/event-nav/calendar-plus.svg";
import plus from "../assets/event-nav/plus.svg";
import { listEvents } from "../api/events";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { Button } from "./Button";
import { eventContext, lifecycleLabel } from "./eventFormat";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";
import "./EventList.css";

const PAGE_SIZE = 50;

export function EventList() {
  const spaces = useCurrentSpace();

  if (spaces.isPending) {
    return <OperatorStatus busy message="불러오는 중이에요." />;
  }
  if (spaces.isError) {
    return (
      <OperatorStatus
        message="불러오지 못했어요."
        action={
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(spaces)}>
            다시 시도
          </Button>
        }
      />
    );
  }
  if (!spaces.space) {
    return (
      <OperatorShell title="행사" framed>
        <div className="event-list__body">
          <section className="event-list__empty">
            <h3 className="event-list__empty-title">아직 들어간 조직이 없어요</h3>
            <Link to="/find-organization">조직 찾기</Link>
          </section>
        </div>
      </OperatorShell>
    );
  }

  return <EventRows spaceId={spaces.space.spaceId} spaceName={spaces.space.name} />;
}

function EventRows({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const events = useQuery({
    queryKey: queryKeys.events(spaceId, page),
    queryFn: () => listEvents(spaceId, { page, size: PAGE_SIZE }),
  });

  return (
    <OperatorShell
      title="행사"
      spaceName={spaceName}
      framed
      action={
        <Button
          type="button"
          variant="secondary"
          size={40}
          className="event-list__new"
          onClick={() => navigate("/events/new")}
        >
          <img src={plus} alt="" />새 행사
        </Button>
      }
    >
      <div className="event-list__body">
        <div className="event-list__intro">
          <div>
            <h2 className="event-list__title">{spaceName}의 행사</h2>
            <p className="event-list__support">준비 중인 행사와 종료된 기록을 한곳에서 관리해요.</p>
          </div>
          <p className="event-list__count">{events.data ? `${events.data.page.totalItems}개의 행사` : ""}</p>
        </div>
        {events.isPending ? <p className="event-list__support">불러오는 중이에요.</p> : null}
        {events.isError ? (
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(events)}>
            다시 시도
          </Button>
        ) : null}
        {events.data && events.data.page.totalItems === 0 ? (
          <section className="event-list__empty">
            <span className="event-list__mark" aria-hidden="true">
              <img src={calendarPlus} alt="" />
            </span>
            <h3 className="event-list__empty-title">아직 만든 행사가 없어요</h3>
            <p className="event-list__empty-copy">
              행사를 먼저 만들고 참가자, 준비 업무와 일정은 필요할 때 시작해요.
            </p>
            <Button type="button" variant="primary" size={40} onClick={() => navigate("/events/new")}>
              첫 행사 만들기
            </Button>
          </section>
        ) : null}
        {events.data && events.data.items.length > 0 ? (
          <ul className="event-list__rows">
            {events.data.items.map((event) => (
              <li key={event.eventId}>
                <button
                  className="event-list__row"
                  type="button"
                  onClick={() => navigate(`/events/${event.eventId}`)}
                >
                  <span className="event-list__row-name">{event.name}</span>
                  <span>{eventContext(event)}</span>
                  <span className="event-list__badge">{lifecycleLabel(event.lifecycleStatus)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {events.data && events.data.page.totalPages > 1 ? (
          <div className="event-list__pages">
            {Array.from({ length: events.data.page.totalPages }, (_, index) => (
              <Button
                key={index}
                type="button"
                variant={index === page ? "primary" : "tertiary"}
                size={32}
                aria-current={index === page ? "page" : undefined}
                onClick={() => setPage(index)}
              >
                {index + 1}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </OperatorShell>
  );
}
