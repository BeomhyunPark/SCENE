import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import type { EventDetail } from "../api/events";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { useEventOwner } from "./useEventOwner";
import "./EventFlow.css";

export function EventSettings() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <SettingsBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function SettingsBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const navigate = useNavigate();
  const owner = useEventOwner(event.eventId);
  const status = event.lifecycleStatus;

  return (
    <OperatorShell
      title={event.name}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${event.eventId}`}
      framed
      leading={
        <Link className="event-home__back" to={`/events/${event.eventId}`} aria-label="행사 홈">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-flow">
        <h2 className="event-flow__title">행사 설정</h2>
        {owner.isPending ? <p className="event-flow__body">불러오는 중이에요.</p> : null}
        {owner.isError ? (
          <>
            <p className="event-flow__body">불러오지 못했어요.</p>
            <Button type="button" variant="secondary" size={40} onClick={() => owner.reload()}>
              다시 시도
            </Button>
          </>
        ) : null}
        {!owner.isPending && !owner.isError && status === "ACTIVE" && owner.isOwner ? (
          <>
            <p className="event-flow__body">이 행사를 종료하면 종료 화면으로 바뀌어요.</p>
            <Button
              type="button"
              variant="danger"
              size={40}
              onClick={() => navigate(`/events/${event.eventId}/end`, { state: { from: "settings" } })}
            >
              행사 종료
            </Button>
          </>
        ) : null}
        {!owner.isPending && !owner.isError && status === "ACTIVE" && !owner.isOwner ? (
          <p className="event-flow__body">행사 Owner만 종료할 수 있어요.</p>
        ) : null}
        {!owner.isPending && !owner.isError && status === "DRAFT" ? (
          <p className="event-flow__body">진행 중인 행사만 종료할 수 있어요.</p>
        ) : null}
        {!owner.isPending && !owner.isError && status === "ENDED" ? (
          <p className="event-flow__body">이미 종료된 행사예요.</p>
        ) : null}
        {!owner.isPending && !owner.isError && status === "ARCHIVED" ? (
          <p className="event-flow__body">보관된 행사예요. 읽을 수만 있어요.</p>
        ) : null}
        {status === "ENDED" || status === "ARCHIVED" ? (
          <Button type="button" variant="secondary" size={40} onClick={() => navigate(`/events/${event.eventId}/retrospective`)}>
            회고 보기
          </Button>
        ) : null}
      </div>
    </OperatorShell>
  );
}
