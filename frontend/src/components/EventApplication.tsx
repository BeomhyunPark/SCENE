import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { getApplication, getApplicationTable, type ApplicationOperation } from "../api/applications";
import { getMyPermissions } from "../api/operators";
import { getMe } from "../api/session";
import { OperationDrawer } from "./OperationDrawer";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { answerLabel, formatAnswer } from "./answerDisplay";
import { applicantName, formatSubmittedAt } from "./eventFormat";
import { markEventArea } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import "./EventHome.css";

/**
 * One application with every answer. It has its own address under the participation screen, like
 * a task detail under the task list, so a refresh or a shared link reopens the same application.
 */
export function EventApplication() {
  const { eventId = "", applicationId = "" } = useParams();
  useEffect(() => {
    if (eventId) markEventArea(eventId, "participants");
  }, [eventId]);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <Detail event={event} spaceName={spaceName} applicationId={applicationId} />}
    </EventScreen>
  );
}

function Detail({ event, spaceName, applicationId }: { event: EventDetail; spaceName?: string; applicationId: string }) {
  const eventId = event.eventId;
  const listPath = `/events/${eventId}/participants`;
  const application = useQuery({
    queryKey: queryKeys.application(eventId, applicationId),
    queryFn: ({ signal }) => getApplication(eventId, applicationId, signal),
    retry: false,
  });
  const nameAnswer = application.data?.answers.find((answer) => answer.systemKey === "NAME");
  const nameText = typeof nameAnswer?.value.text === "string" ? nameAnswer.value.text : null;
  const title = application.data ? applicantName(nameText) : "신청 내용";

  return (
    <OperatorShell
      title={title}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      eventAreas={["participants"]}
      participantsHref={listPath}
      framed
      leading={
        <Link className="event-home__back" to={listPath} aria-label="신청자 목록">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-home">
        {application.isPending ? <p>불러오는 중이에요.</p> : null}
        {application.isError ? <Failure error={application.error} onRetry={() => reloadQuery(application)} /> : null}
        {application.data ? (
          <OperationSection event={event} applicationId={applicationId} operation={application.data.operation} />
        ) : null}
        {application.data ? (
          <section className="event-home__answers" aria-labelledby="answers-title">
            <div className="event-home__applicants-head">
              <h2 id="answers-title">신청 내용</h2>
              <span className="event-home__applicant-time">{formatSubmittedAt(application.data.submittedAt)}</span>
            </div>
            {application.data.answers.length === 0 ? <p>받은 답변이 없어요.</p> : null}
            <dl>
              {application.data.answers.map((answer) => (
                <div key={answer.fieldId}>
                  <dt>{answerLabel(answer)}</dt>
                  <dd>{formatAnswer(answer)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </OperatorShell>
  );
}

/**
 * 운영 메모 on the detail (#337, DEC-075): everyone who reads the detail sees it; 수정 opens the same
 * drawer as the table, fed by the table row (it carries the group and participant id).
 */
function OperationSection({
  event,
  applicationId,
  operation,
}: {
  event: EventDetail;
  applicationId: string;
  operation: ApplicationOperation;
}) {
  const eventId = event.eventId;
  const [open, setOpen] = useState(false);
  const table = useQuery({
    queryKey: queryKeys.applicationTable(eventId),
    queryFn: ({ signal }) => getApplicationTable(eventId, signal),
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const effective = permissions.data?.effective ?? [];
  const row = table.data?.rows.find((item) => item.applicationId === applicationId);
  const mayEdit =
    effective.includes("PARTICIPANT_WRITE") || Boolean(table.data?.groupVisible && effective.includes("GROUP_WRITE"));
  // The table row is fresher after a save from the drawer; the detail refetches behind it.
  const shown = row?.operation ?? operation;
  return (
    <section className="event-home__answers" aria-labelledby="operation-title">
      <div className="event-home__applicants-head">
        <h2 id="operation-title">운영 메모</h2>
        {shown.version > 0 && shown.updatedAt ? (
          <span className="event-home__applicant-time">
            {formatSubmittedAt(shown.updatedAt)}
            {shown.updatedByDisplayName ? ` · ${shown.updatedByDisplayName}` : ""}
          </span>
        ) : null}
        {mayEdit && row ? (
          <Button type="button" variant="secondary" size={32} onClick={() => setOpen(true)}>
            수정
          </Button>
        ) : null}
      </div>
      <p className="event-home__memo">{shown.memo || "아직 메모가 없어요."}</p>
      {open && row && table.data ? (
        <OperationDrawer
          eventId={eventId}
          eventStatus={event.lifecycleStatus}
          table={table.data}
          row={row}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return <p role="alert">신청을 찾을 수 없어요.</p>;
  if (isApiError(error, "FORBIDDEN")) return <p role="alert">이 신청을 볼 권한이 없어요.</p>;
  return (
    <>
      <p role="alert">불러오지 못했어요.</p>
      <Button type="button" variant="secondary" size={40} onClick={onRetry}>
        다시 시도
      </Button>
    </>
  );
}
