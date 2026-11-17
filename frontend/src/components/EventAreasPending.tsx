import { Link, useParams } from "react-router";
import type { EventDetail } from "../api/events";
import { EventScreen } from "./EventScreen";
import { readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import "./MenuPending.css";

/**
 * "다른 운영 시작" in the event sidebar (#266). Picking which areas an event uses
 * (A02 Capability Discovery) needs an API to store the choice, so this shows "준비 중" for now.
 */
export function EventAreasPending() {
  const { eventId = "" } = useParams();
  return <EventScreen eventId={eventId}>{(event, spaceName) => <Body event={event} spaceName={spaceName} />}</EventScreen>;
}

function Body({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventHref = `/events/${event.eventId}`;
  return (
    <OperatorShell
      title="다른 운영 시작"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={readEventAreas(event.eventId)}
      participantsHref={`${eventHref}/participants`}
      tasksHref={`${eventHref}/tasks`}
      framed
    >
      <div className="menu-pending">
        <section className="menu-pending__card">
          <h2 className="menu-pending__title">아직 준비 중이에요</h2>
          <p className="menu-pending__body">이 행사에서 쓸 운영을 고르는 화면은 아직 만들고 있어요.</p>
          <Link className="menu-pending__link" to={eventHref}>
            행사로 돌아가기
          </Link>
        </section>
      </div>
    </OperatorShell>
  );
}
