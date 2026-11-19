import { Link, useParams } from "react-router";
import type { EventDetail } from "../api/events";
import { EventScreen } from "./EventScreen";
import { readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import "./MenuPending.css";

/**
 * "준비 중" page inside an event, for event sidebar menus without a screen yet.
 * - 다른 기능 시작 (#266): picking areas (A02) needs an API to store the choice.
 * - 현장 운영 (#268) now has its own screen (EventField, #285).
 */
export function EventMenuPending({ title, message }: { title: string; message: string }) {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <Body event={event} spaceName={spaceName} title={title} message={message} />}
    </EventScreen>
  );
}

function Body({
  event,
  spaceName,
  title,
  message,
}: {
  event: EventDetail;
  spaceName?: string;
  title: string;
  message: string;
}) {
  const eventHref = `/events/${event.eventId}`;
  return (
    <OperatorShell
      title={title}
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
          <p className="menu-pending__body">{message}</p>
          <Link className="menu-pending__link" to={eventHref}>
            행사로 돌아가기
          </Link>
        </section>
      </div>
    </OperatorShell>
  );
}
