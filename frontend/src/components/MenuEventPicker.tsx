import { Link, Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { listEvents, type EventListItem } from "../api/events";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { Button } from "./Button";
import { eventContext } from "./eventFormat";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";
import "./MenuPending.css";

/** Matches the event list page so both share the first page in the query cache. */
const PAGE_SIZE = 50;

export type EventArea = "tasks" | "participants" | "operators" | "field";

/** 을/를 for the last Hangul syllable of a menu name. */
function withObjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasFinal ? "을" : "를"}`;
}

function isOpen(event: EventListItem): boolean {
  return event.lifecycleStatus !== "ENDED" && event.lifecycleStatus !== "ARCHIVED";
}

/**
 * Organization sidebar entry for menus whose screens live inside an event (#267, 현장 운영 #268).
 * One open event opens it directly; several open events are listed to pick from.
 * Ended and archived events are reached from the event list instead.
 */
export function MenuEventPicker({ title, area }: { title: string; area: EventArea }) {
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
    return <Navigate replace to="/events" />;
  }
  return <Picker title={title} area={area} spaceId={spaces.space.spaceId} spaceName={spaces.space.name} />;
}

function Picker({
  title,
  area,
  spaceId,
  spaceName,
}: {
  title: string;
  area: EventArea;
  spaceId: string;
  spaceName: string;
}) {
  const events = useQuery({
    queryKey: queryKeys.events(spaceId, 0),
    queryFn: () => listEvents(spaceId, { page: 0, size: PAGE_SIZE }),
  });
  const open = events.data?.items.filter(isOpen) ?? [];
  const more = (events.data?.page.totalPages ?? 0) > 1;

  if (events.data && open.length === 1 && !more) {
    return <Navigate replace to={`/events/${open[0].eventId}/${area}`} />;
  }

  return (
    <OperatorShell title={title} spaceName={spaceName} framed>
      <div className="menu-pending">
        <section className="menu-pending__card">
          {events.isPending ? <p className="menu-pending__body">불러오는 중이에요.</p> : null}
          {events.isError ? (
            <>
              <p className="menu-pending__body">행사 목록을 불러오지 못했어요.</p>
              <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(events)}>
                다시 시도
              </Button>
            </>
          ) : null}
          {events.data && open.length === 0 ? (
            <>
              <h2 className="menu-pending__title">진행 중인 행사가 없어요</h2>
              <p className="menu-pending__body">종료된 행사는 행사 목록에서 열 수 있어요.</p>
            </>
          ) : null}
          {open.length > 0 ? (
            <>
              <h2 className="menu-pending__title">어느 행사의 {withObjectParticle(title)} 볼까요?</h2>
              <ul className="menu-pending__events">
                {open.map((event) => (
                  <li key={event.eventId}>
                    <Link className="menu-pending__event" to={`/events/${event.eventId}/${area}`}>
                      <span className="menu-pending__event-name">{event.name}</span>
                      {eventContext(event) ? (
                        <span className="menu-pending__body">{eventContext(event)}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {events.data ? (
            <Link className="menu-pending__link" to="/events">
              {more ? "행사 목록에서 더 보기" : "행사 목록으로"}
            </Link>
          ) : null}
        </section>
      </div>
    </OperatorShell>
  );
}
