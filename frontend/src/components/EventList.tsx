import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import calendarPlus from "../assets/event-nav/calendar-plus.svg";
import plus from "../assets/event-nav/plus.svg";
import { listEvents, listOperatedEvents, type OperatedEventItem } from "../api/events";
import { mayCreateEvents } from "../api/spaces";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { prototypeScreensEnabled } from "../prototypeScreens";
import { Button } from "./Button";
import { eventContext, lifecycleLabel, operatorRoleLabel } from "./eventFormat";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";
import "./EventList.css";

const PAGE_SIZE = 50;
const OPERATED_PAGE_SIZE = 100;

/**
 * The event list. A member sees their organization's events; anyone also sees "협력 중인 행사", the
 * events they operate in an organization they are not shown here for (#387): an event-only
 * collaborator (DEC-039, DEC-060), someone who left the organization but kept or was invited back
 * to an event, and a member who helps on another organization's event.
 */
export function EventList() {
  const spaces = useCurrentSpace();
  const [operatedPage, setOperatedPage] = useState(0);
  const operated = useQuery({
    queryKey: queryKeys.operatedEvents(operatedPage),
    queryFn: ({ signal }) => listOperatedEvents({ page: operatedPage, size: OPERATED_PAGE_SIZE }, signal),
  });

  if (spaces.isPending || (!spaces.space && operated.isPending)) {
    return <OperatorStatus busy message="불러오는 중이에요." />;
  }
  if (spaces.isError || (!spaces.space && operated.isError)) {
    return (
      <OperatorStatus
        message="불러오지 못했어요."
        action={
          <Button
            type="button"
            variant="secondary"
            size={40}
            onClick={() => (spaces.isError ? reloadQuery(spaces) : reloadQuery(operated))}
          >
            다시 시도
          </Button>
        }
      />
    );
  }
  const collaborations = (
    <Collaborations
      items={(operated.data?.items ?? []).filter((item) => item.spaceId !== spaces.space?.spaceId)}
      totalPages={operated.data?.page.totalPages ?? 0}
      page={operatedPage}
      onPage={setOperatedPage}
      failed={operated.isError}
      onRetry={() => reloadQuery(operated)}
      lead={!spaces.space}
    />
  );
  if (!spaces.space && (operated.data?.page.totalItems ?? 0) > 0) {
    return (
      <OperatorShell title="행사" framed>
        <div className="event-list__body">{collaborations}</div>
      </OperatorShell>
    );
  }
  if (!spaces.space) {
    return (
      <OperatorShell title="행사" framed>
        <div className="event-list__body">
          <section className="event-list__empty">
            <h3 className="event-list__empty-title">아직 들어간 조직이 없어요</h3>
            {prototypeScreensEnabled() ? (
              <Link to="/find-organization">조직 찾기</Link>
            ) : (
              <p className="event-list__empty-copy">운영진에게 받은 초대 링크로 들어와 주세요.</p>
            )}
          </section>
        </div>
      </OperatorShell>
    );
  }

  return (
    <EventRows
      spaceId={spaces.space.spaceId}
      spaceName={spaces.space.name}
      mayCreate={mayCreateEvents(spaces.space.role)}
      extra={collaborations}
    />
  );
}

/**
 * "협력 중인 행사": events I operate outside the organization shown above, each with its
 * organization and my role. Without an organization this is the whole list (`lead`).
 */
function Collaborations({
  items,
  totalPages,
  page,
  onPage,
  failed,
  onRetry,
  lead,
}: {
  items: OperatedEventItem[];
  totalPages: number;
  page: number;
  onPage: (page: number) => void;
  failed: boolean;
  onRetry: () => void;
  lead: boolean;
}) {
  const navigate = useNavigate();
  if (failed) {
    return (
      <section className="event-list__collab" aria-labelledby="collab-title">
        <h2 id="collab-title" className="event-list__collab-title">
          협력 중인 행사
        </h2>
        <p className="event-list__support">협력 중인 행사를 불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={onRetry}>
          다시 시도
        </Button>
      </section>
    );
  }
  if (items.length === 0 && page === 0) return null;
  return (
    <section
      className={lead ? "event-list__collab event-list__collab--lead" : "event-list__collab"}
      aria-labelledby="collab-title"
    >
      <div className="event-list__intro">
        <div>
          <h2 id="collab-title" className={lead ? "event-list__title" : "event-list__collab-title"}>
            협력 중인 행사
          </h2>
          {/* 조직 아래에 붙을 때는 제목과 행의 조직 이름으로 충분해 설명을 두지 않는다(#483). */}
          {lead ? <p className="event-list__support">조직 멤버가 아니어도, 운영자로 함께하는 행사는 여기서 열 수 있어요.</p> : null}
        </div>
        <p className="event-list__count">{`${items.length}개의 행사`}</p>
      </div>
      <ul className="event-list__rows">
        {items.map((event) => (
          <li key={event.eventId}>
            <button className="event-list__row" type="button" onClick={() => navigate(`/events/${event.eventId}`)}>
              <span className="event-list__row-main">
                <span className="event-list__row-name">{event.name}</span>
                <span className="event-list__row-org">
                  {event.spaceName} · {operatorRoleLabel(event.eventRole)}
                </span>
              </span>
              <span>{eventContext(event)}</span>
              <span className="event-list__badge">{lifecycleLabel(event.lifecycleStatus)}</span>
            </button>
          </li>
        ))}
      </ul>
      {totalPages > 1 ? (
        <div className="event-list__pages">
          {Array.from({ length: totalPages }, (_, index) => (
            <Button
              key={index}
              type="button"
              variant={index === page ? "primary" : "tertiary"}
              size={32}
              aria-current={index === page ? "page" : undefined}
              onClick={() => onPage(index)}
            >
              {index + 1}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EventRows({
  spaceId,
  spaceName,
  mayCreate,
  extra,
}: {
  spaceId: string;
  spaceName: string;
  mayCreate: boolean;
  extra?: ReactNode;
}) {
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
        mayCreate ? (
          <Button
            type="button"
            variant="secondary"
            size={40}
            className="event-list__new"
            onClick={() => navigate("/events/new")}
          >
            <img src={plus} alt="" />새 행사
          </Button>
        ) : undefined
      }
    >
      <div className="event-list__body">
        {/* 머리 "행사"를 되풀이하던 설명 줄은 뺐다(#483). 어느 조직인지와 개수만 한 번씩 남기고, 빈 목록에서는 개수 대신 빈 상태 안내가 말한다. */}
        <div className="event-list__intro">
          <h2 className="event-list__title">{spaceName}의 행사</h2>
          {events.data && events.data.page.totalItems > 0 ? (
            <p className="event-list__count">{`${events.data.page.totalItems}개의 행사`}</p>
          ) : null}
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
            {mayCreate ? (
              <>
                <h3 className="event-list__empty-title">아직 만든 행사가 없어요</h3>
                <p className="event-list__empty-copy">
                  행사를 먼저 만들고 참가자, 준비 업무와 일정은 필요할 때 시작해요.
                </p>
                <Button type="button" variant="primary" size={40} onClick={() => navigate("/events/new")}>
                  첫 행사 만들기
                </Button>
              </>
            ) : (
              <>
                <h3 className="event-list__empty-title">아직 운영하는 행사가 없어요</h3>
                <p className="event-list__empty-copy">관리자가 만든 행사에 운영자로 추가되면 여기에 보여요.</p>
              </>
            )}
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
        {extra}
      </div>
    </OperatorShell>
  );
}
