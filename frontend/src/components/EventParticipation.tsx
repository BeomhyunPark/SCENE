import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import checklist from "../assets/event-home/checklist.svg";
import dateIcon from "../assets/event-home/date.svg";
import { ApplicantsExport } from "./ApplicantsExport";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { getApplicationTable, type TableRow } from "../api/applications";
import type { LifecycleStatus } from "../api/events";
import { getMyPermissions } from "../api/operators";
import { getMe } from "../api/session";
import { OperationDrawer } from "./OperationDrawer";
import { WithdrawnList } from "./ApplicationWithdraw";
import { statusChangeBlocked } from "./applicationStatus";
import { AddressButton } from "./ParticipantAddress";
import { ApplicantTable } from "./applicantTable/ApplicantTable";
import type { EventDetail } from "../api/events";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { EventScreen } from "./EventScreen";
import { eventContext, lifecycleLabel } from "./eventFormat";
import { markEventArea } from "./eventLocalState";
import "./EventHome.css";

// "QR로 공유하기"(누를 곳 없음)와 "참가자 직접 추가"(위 "참가자 추가"와 같은 곳)는 #483에서 뺐다.
const ways = [{ title: "신청 링크 만들기", detail: "공유할 주소를 만들어요", badge: "시작", action: "준비" }];

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

function Applicants({
  eventId,
  eventStatus,
  empty,
}: {
  eventId: string;
  eventStatus: LifecycleStatus;
  empty: ReactNode;
}) {
  const table = useQuery({
    queryKey: queryKeys.applicationTable(eventId),
    queryFn: ({ signal }) => getApplicationTable(eventId, signal),
    enabled: eventId.length > 0,
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (table.isPending) {
    return (
      <section className="event-home__applicants">
        <p>불러오는 중이에요.</p>
      </section>
    );
  }
  if (table.isError) {
    return (
      <section className="event-home__applicants">
        <p>신청자를 불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(table)}>
          다시 시도
        </Button>
      </section>
    );
  }
  const total = table.data.rows.length;
  if (total === 0 && table.data.withdrawn.length === 0) {
    return (
      <>
        {empty}
        <ApplicantsExport eventId={eventId} total={0} />
      </>
    );
  }
  // 수정 (#337) shows for anyone who can change something in the drawer: the memo or the group.
  const effective = permissions.data?.effective ?? [];
  const mayEdit =
    effective.includes("PARTICIPANT_WRITE") || (table.data.groupVisible && effective.includes("GROUP_WRITE"));
  const editRow = editing ? table.data.rows.find((row) => row.applicationId === editing) : undefined;
  return (
    <>
      {notice ? (
        <p className="withdrawn__notice" role="status">
          {notice}
        </p>
      ) : null}
      <ApplicantTable
        eventId={eventId}
        table={table.data}
        onEdit={mayEdit ? (row: TableRow) => setEditing(row.applicationId) : undefined}
        editNote={
          permissions.isSuccess && !mayEdit
            ? "운영 메모·조 배정을 고칠 권한이 없어 수정 버튼이 없어요. 행사 소유자에게 요청해 주세요."
            : undefined
        }
        withdrawnPanel={
          <WithdrawnList
            eventId={eventId}
            withdrawn={table.data.withdrawn}
            blocked={statusChangeBlocked(eventStatus, effective.includes("PARTICIPANT_WRITE"), permissions.isPending)}
          />
        }
        actions={
          <>
            {/* 신청 집계 (#251): a secondary toolbar button, as 정렬·필터 on 1325:5059. */}
            <Link
              className="scene-button scene-button--secondary scene-button--size-40 event-home__summary-link"
              to={`/events/${eventId}/participants/summary`}
            >
              신청 집계
            </Link>
            {/* 신청서 설정 (#497): the way to open/close applications and edit questions, in sight on the toolbar. */}
            <Link
              className="scene-button scene-button--secondary scene-button--size-40 event-home__summary-link"
              to={`/events/${eventId}/participants/setup`}
            >
              신청서 설정
            </Link>
            <ApplicantsExport eventId={eventId} total={total} />
            {/* 신청 주소·참가자 주소와 QR (#497): behind one button instead of under the roster. */}
            <AddressButton eventId={eventId} />
            {/* 참가자 직접 추가 (DEC-088 §3): also after applications close and at the 현장 desk. */}
            {effective.includes("PARTICIPANT_WRITE") && eventStatus !== "ENDED" && eventStatus !== "ARCHIVED" ? (
              <Link
                className="scene-button scene-button--secondary scene-button--size-40"
                to={`/events/${eventId}/participants/new`}
              >
                참가자 추가
              </Link>
            ) : null}
          </>
        }
      />
      {editRow ? (
        <OperationDrawer
          eventId={eventId}
          eventStatus={eventStatus}
          table={table.data}
          row={editRow}
          onClose={() => setEditing(null)}
          onWithdrawn={setNotice}
        />
      ) : null}
    </>
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
      title="참가 현황"
      spaceName={spaceName}
      eventName={title}
      eventHref={eventId ? `/events/${eventId}` : undefined}
      eventAreas={["participants"]}
      participantsHref={eventId ? `/events/${eventId}/participants` : undefined}
      framed
      leading={
        <Link className="event-home__back scene-press scene-press--text" to="/events" aria-label="행사 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
      action={
        <Button type="button" variant="secondary" size={40} onClick={() => navigate(`/events/${eventId}/settings`)}>
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
        </div>
        {/* 참가자를 받는 방법 (#497, #483 제안 3): only while nobody has applied. With applicants the
            table toolbar carries 신청서 설정 and 주소·QR. */}
        <Applicants
          eventId={eventId}
          eventStatus={event.lifecycleStatus}
          empty={
            <>
              <section className="event-home__welcome">
                <span className="event-home__mark" aria-hidden="true">
                  <img src={calendarCheck} alt="" />
                </span>
                <div className="event-home__welcome-copy">
                  <h2>아직 참가자가 없어요.</h2>
                  <p>신청을 열거나 운영자가 직접 추가할 수 있어요.</p>
                </div>
                <div className="event-home__welcome-actions">
                  <AddressButton eventId={eventId} />
                  <Button type="button" variant="primary" size={40} onClick={() => navigate(setupPath)}>
                    참가 신청 준비
                  </Button>
                </div>
              </section>
              <div className="event-home__work-intro">
                <h2>참가자를 받는 방법</h2>
                <p>행사에 맞는 방법으로 시작해 보세요.</p>
              </div>
              <div className="event-home__cards">
                {ways.map((item) => (
                  <button
                    key={item.title}
                    className="event-home__card scene-press scene-press--card"
                    type="button"
                    aria-label={item.title}
                    onClick={() => navigate(setupPath)}
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
            </>
          }
        />
      </div>
    </OperatorShell>
  );
}
