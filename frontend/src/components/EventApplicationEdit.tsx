import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { getApplication, reviseApplicationAnswers, type AnswerItem, type ApplicationDetail } from "../api/applications";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import { getForm, type FormField } from "../api/forms";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { toRawAnswers } from "./apply/answerModel";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { applicantName } from "./eventFormat";
import { markEventArea } from "./eventLocalState";
import { OperatorAnswerForm } from "./OperatorAnswerForm";
import { editBlocked, hasConsent, operatorFields, useEffectivePermissions, type EditNotice } from "./operatorAnswers";
import { OperatorShell } from "./OperatorShell";
import "./EventHome.css";

/**
 * 신청 고치기 (DEC-088 §2, A12 #462, #339): an operator changes a participant's answers, also after
 * applications and edits close. The save is a new revision that keeps the operator; the summary,
 * group board, CSV, table, meal counts and leader view follow it.
 */
export function EventApplicationEdit() {
  const { eventId = "", applicationId = "" } = useParams();
  useEffect(() => {
    if (eventId) markEventArea(eventId, "participants");
  }, [eventId]);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <Edit event={event} spaceName={spaceName} applicationId={applicationId} />}
    </EventScreen>
  );
}

function Edit({ event, spaceName, applicationId }: { event: EventDetail; spaceName?: string; applicationId: string }) {
  const eventId = event.eventId;
  const detailPath = `/events/${eventId}/participants/${applicationId}`;
  const application = useQuery({
    queryKey: queryKeys.application(eventId, applicationId),
    queryFn: ({ signal }) => getApplication(eventId, applicationId, signal),
    retry: false,
  });
  const formId = application.data?.formId ?? "";
  const form = useQuery({
    queryKey: queryKeys.form(eventId, formId),
    queryFn: () => getForm(eventId, formId),
    enabled: formId.length > 0,
  });
  const { effective, pending } = useEffectivePermissions(eventId);
  const nameAnswer = application.data?.answers.find((answer) => answer.systemKey === "NAME");
  const name = applicantName(typeof nameAnswer?.value.text === "string" ? nameAnswer.value.text : null);

  let body: ReactNode = <p>불러오는 중이에요.</p>;
  if (application.isError || form.isError) {
    body = (
      <>
        <p role="alert">
          {isApiError(application.error, "RESOURCE_NOT_FOUND") ? "신청을 찾을 수 없어요." : "불러오지 못했어요."}
        </p>
        <Button type="button" variant="secondary" size={40} onClick={() => (application.isError ? reloadQuery(application) : reloadQuery(form))}>
          다시 시도
        </Button>
      </>
    );
  } else if (application.data && form.data && !pending) {
    const blocked = editBlocked(event, application.data, effective);
    body = blocked ? (
      <p role="alert">{blocked}</p>
    ) : (
      <EditForm key={application.data.applicationId} event={event} application={application.data} formFields={form.data.fields} />
    );
  }

  return (
    <OperatorShell
      title={`${name} 신청 고치기`}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      eventAreas={["participants"]}
      participantsHref={`/events/${eventId}/participants`}
      framed
      leading={
        <Link className="event-home__back" to={detailPath} aria-label="신청 내용">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-home">{body}</div>
    </OperatorShell>
  );
}

function EditForm({ event, application, formFields }: { event: EventDetail; application: ApplicationDetail; formFields: FormField[] }) {
  const eventId = event.eventId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fields = useMemo(() => operatorFields(formFields), [formFields]);
  const initial = useMemo(
    () => toRawAnswers(fields, application.answers.filter((answer) => answer.value !== null).map((answer) => ({ fieldId: answer.fieldId, value: answer.value! }))),
    [fields, application.answers],
  );
  const [failure, setFailure] = useState<ReactNode>(null);
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const phoneId = fields.find((field) => field.systemKey === "PHONE")?.fieldId;
  const detailPath = `/events/${eventId}/participants/${application.applicationId}`;

  const save = useMutation({
    mutationFn: (answers: AnswerItem[]) =>
      reviseApplicationAnswers(eventId, application.applicationId, { expectedRevision: application.revision, answers }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
      navigate(`/events/${eventId}/participants/${result.applicationId}`, {
        state: { edited: result.revised ? "saved" : "unchanged" } satisfies EditNotice,
      });
    },
  });

  return (
    <OperatorAnswerForm
      fields={fields}
      initial={initial}
      lead={
        <>
          <p>운영자가 참가자 대신 답을 고쳐요. 신청·수정을 닫은 뒤에도 고칠 수 있어요.</p>
          <p>
            저장하면 새 수정본으로 남고 "운영자가 고침"으로 보여요. 참가자에게 알림이 가고, 집계·조 편성·식수·숙소·CSV가 고친 값을
            따라가요. 이름과 전화번호 말고는 비워 둘 수 있어요.
          </p>
          {hasConsent(formFields) ? <p>동의 질문은 참가자가 답한 그대로 두어요.</p> : null}
        </>
      }
      submitLabel="고친 내용 저장"
      pending={save.isPending}
      failure={failure}
      fieldErrors={fieldErrors}
      cancel={
        <Link className="scene-button scene-button--secondary scene-button--size-40" to={detailPath}>
          그만두기
        </Link>
      }
      onSubmit={(answers, draft) => {
        setFailure(null);
        setFieldErrors(new Map());
        save.mutate(answers, {
          onError: (error) => {
            if (isApiError(error, "CONCURRENT_MODIFICATION")) {
              const current = typeof error.extensions.applicationId === "string" ? error.extensions.applicationId : null;
              setFailure(
                <>
                  그 사이 신청이 바뀌었어요.{" "}
                  {current ? <Link to={`/events/${eventId}/participants/${current}/edit`}>지금 신청을 다시 열어</Link> : "지금 신청을 다시 열어"} 고쳐 주세요.
                </>,
              );
              return;
            }
            if (isApiError(error, "APPLICATION_ALREADY_EXISTS")) {
              if (phoneId) setFieldErrors(new Map([[phoneId, "이 행사의 다른 참가자가 쓰는 전화번호예요."]]));
              setFailure("다른 참가자가 쓰는 전화번호예요.");
              return;
            }
            if (isApiError(error, "APPLICATION_VALIDATION_FAILED", "VALIDATION_FAILED")) {
              draft.refuseRange();
              draft.setShowAll(true);
              setFailure("입력 내용을 확인해 주세요.");
              return;
            }
            if (isApiError(error, "INVALID_STATE_TRANSITION")) {
              setFailure("취소된 신청이에요. 참가 현황의 취소 목록에서 되돌린 뒤 고쳐 주세요.");
              return;
            }
            if (isApiError(error, "EVENT_ARCHIVED")) {
              setFailure("보관된 행사라 신청을 고칠 수 없어요.");
              return;
            }
            if (isApiError(error, "FORBIDDEN")) {
              setFailure("신청을 고칠 권한이 없어요.");
              return;
            }
            setFailure("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
          },
        });
      }}
    />
  );
}
