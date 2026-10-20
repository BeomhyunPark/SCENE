import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import checklist from "../assets/event-home/checklist.svg";
import dateIcon from "../assets/event-home/date.svg";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import type { EventDetail } from "../api/events";
import { listForms } from "../api/forms";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { EventScreen } from "./EventScreen";
import { eventContext, lifecycleLabel } from "./eventFormat";
import { markEventArea } from "./eventLocalState";
import "./EventHome.css";

const ways = [
  { title: "신청 링크 만들기", detail: "공유할 주소를 만들어요", badge: "시작", action: "준비" },
  { title: "QR로 공유하기", detail: "현장 · 인쇄물에 사용", badge: "선택", action: "준비" },
  { title: "참가자 직접 추가", detail: "운영자가 명단에 입력", badge: "선택", action: "추가" },
];

export function EventParticipation() {
  const { eventId = "" } = useParams();
  useEffect(() => {
    if (eventId) markEventArea(eventId, "participants");
  }, [eventId]);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <ParticipationBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function ApplyAddress({ eventId }: { eventId: string }) {
  const forms = useQuery({
    queryKey: queryKeys.forms(eventId, 0),
    queryFn: () => listForms(eventId, { page: 0, size: 20 }),
    enabled: eventId.length > 0,
  });
  const [copied, setCopied] = useState(false);
  const open = forms.data?.items.find((item) => item.acceptingApplications);
  const address = open ? `${window.location.origin}/apply/${eventId}/${open.formId}` : "";

  return (
    <section className="event-home__apply">
      <h2>신청 주소</h2>
      {forms.isPending ? <p>불러오는 중이에요.</p> : null}
      {forms.isError ? (
        <>
          <p>불러오지 못했어요.</p>
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(forms)}>
            다시 시도
          </Button>
        </>
      ) : null}
      {forms.isSuccess && open ? (
        <>
          <p>이 주소를 보내면 참가자가 신청할 수 있어요.</p>
          <input className="event-home__address" readOnly aria-label="신청 주소" value={address} />
          {copied ? <p>복사했어요.</p> : null}
          <Button
            type="button"
            variant="secondary"
            size={40}
            onClick={() => {
              void navigator.clipboard.writeText(address).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            복사
          </Button>
        </>
      ) : null}
      {forms.isSuccess && !open ? <p>신청을 열면 주소를 복사할 수 있어요.</p> : null}
    </section>
  );
}

function ParticipationBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const navigate = useNavigate();
  const eventId = event.eventId;
  const setupPath = `/events/${eventId}/participants/setup`;
  const title = event.name;
  const context = eventContext(event);
  const draftStatus = event.lifecycleStatus === "DRAFT";

  return (
    <OperatorShell
      title={title}
      spaceName={spaceName}
      eventName={title}
      eventHref={eventId ? `/events/${eventId}` : undefined}
      eventAreas={["participants"]}
      participantsHref={eventId ? `/events/${eventId}/participants` : undefined}
      framed
      leading={
        <Link className="event-home__back" to="/events" aria-label="행사 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
      action={
        <Button type="button" variant="secondary" size={40}>
          행사 설정
        </Button>
      }
    >
      <div className="event-home">
        <div className="event-home__context">
          <div>
            {context ? <p className="event-home__facts">{context}</p> : null}
            <p className="event-home__state">{draftStatus ? "새로 만든 행사" : lifecycleLabel(event.lifecycleStatus)}</p>
          </div>
          <span className="event-home__badge">참가 운영</span>
        </div>
        <section className="event-home__welcome">
          <span className="event-home__mark" aria-hidden="true">
            <img src={calendarCheck} alt="" />
          </span>
          <div className="event-home__welcome-copy">
            <h2>아직 참가자가 없어요.</h2>
            <p>신청을 열거나 운영자가 직접 추가할 수 있어요.</p>
          </div>
          <Button type="button" variant="primary" size={40} onClick={() => setupPath && navigate(setupPath)}>
            참가 신청 준비
          </Button>
        </section>
        <ApplyAddress eventId={eventId} />
        <div className="event-home__work-intro">
          <h2>참가자를 받는 방법</h2>
          <p>행사에 맞는 방법으로 시작해 보세요.</p>
        </div>
        <div className="event-home__cards">
          {ways.map((item) => (
            <button
              key={item.title}
              className="event-home__card"
              type="button"
              aria-label={item.title}
              onClick={item.title === "신청 링크 만들기" && setupPath ? () => navigate(setupPath) : undefined}
            >
              <span className="event-home__chip">{item.badge}</span>
              <span className="event-home__card-title">{item.title}</span>
              <span className="event-home__card-meta">
                <span>
                  <img src={dateIcon} alt="" />
                  {item.detail}
                </span>
                <span>
                  <img src={checklist} alt="" />
                  {item.action}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="event-home__note">참가자는 링크나 QR로 신청하며 SCENE 계정이 필요하지 않아요.</p>
      </div>
    </OperatorShell>
  );
}
