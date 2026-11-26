import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { addParticipant, type AnswerItem, type ParticipantAdded } from "../api/applications";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import { getForm, listForms, type FormField } from "../api/forms";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { markEventArea } from "./eventLocalState";
import { OperatorAnswerForm } from "./OperatorAnswerForm";
import { addBlocked, hasConsent, operatorFields, useEffectivePermissions } from "./operatorAnswers";
import { OperatorShell } from "./OperatorShell";
import "./EventHome.css";

/**
 * 참가자 직접 추가 (DEC-088 §3, A12 #462): an operator adds a person who did not apply, also after
 * applications close and at the 현장 desk. The person gets a temporary number shown once here; they
 * sign in with it at the participant address and choose their own number (A3b's way).
 */
export function EventParticipantAdd() {
  const { eventId = "" } = useParams();
  useEffect(() => {
    if (eventId) markEventArea(eventId, "participants");
  }, [eventId]);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <Add event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function Add({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const listPath = `/events/${eventId}/participants`;
  const forms = useQuery({
    queryKey: queryKeys.forms(eventId, 0),
    queryFn: () => listForms(eventId, { page: 0, size: 20 }),
  });
  // The open form if there is one, else the first; an event normally has one form.
  const formId = (forms.data?.items.find((item) => item.acceptingApplications) ?? forms.data?.items[0])?.formId ?? "";
  const form = useQuery({
    queryKey: queryKeys.form(eventId, formId),
    queryFn: () => getForm(eventId, formId),
    enabled: formId.length > 0,
  });
  const { effective, pending } = useEffectivePermissions(eventId);
  const [added, setAdded] = useState<{ result: ParticipantAdded; name: string } | null>(null);
  const [round, setRound] = useState(0);

  let body: ReactNode = <p>불러오는 중이에요.</p>;
  if (forms.isError || form.isError) {
    body = (
      <>
        <p role="alert">불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => (forms.isError ? reloadQuery(forms) : reloadQuery(form))}>
          다시 시도
        </Button>
      </>
    );
  } else if (forms.isSuccess && !formId) {
    body = (
      <p role="alert">
        신청서가 아직 없어요. <Link to={`/events/${eventId}/participants/setup`}>참가 신청 준비</Link>에서 먼저 만들어 주세요.
      </p>
    );
  } else if (!pending && addBlocked(event, effective)) {
    body = <p role="alert">{addBlocked(event, effective)}</p>;
  } else if (added) {
    body = (
      <TemporaryPin
        eventId={eventId}
        added={added}
        onNext={() => {
          setAdded(null);
          setRound((value) => value + 1);
        }}
      />
    );
  } else if (form.data && !pending) {
    body = <AddForm key={round} eventId={eventId} formId={formId} formFields={form.data.fields} onAdded={(result, name) => setAdded({ result, name })} />;
  }

  return (
    <OperatorShell
      title="참가자 직접 추가"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      eventAreas={["participants"]}
      participantsHref={listPath}
      framed
      leading={
        <Link className="event-home__back scene-press scene-press--text" to={listPath} aria-label="참가 현황">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-home">{body}</div>
    </OperatorShell>
  );
}

function AddForm({
  eventId,
  formId,
  formFields,
  onAdded,
}: {
  eventId: string;
  formId: string;
  formFields: FormField[];
  onAdded: (result: ParticipantAdded, name: string) => void;
}) {
  const queryClient = useQueryClient();
  const fields = useMemo(() => operatorFields(formFields), [formFields]);
  const nameId = fields.find((field) => field.systemKey === "NAME")?.fieldId;
  const phoneId = fields.find((field) => field.systemKey === "PHONE")?.fieldId;
  const [failure, setFailure] = useState<ReactNode>(null);
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const save = useMutation({ mutationFn: (answers: AnswerItem[]) => addParticipant(eventId, { formId, answers }) });

  return (
    <OperatorAnswerForm
      fields={fields}
      initial={{}}
      // One line, as O04-A01 (#497, #483 제안 16). (필수) on 이름·전화 says the rest may stay empty, the
      // temporary number's "전해 주세요" is on the screen that shows it, and the consent line sits under the questions.
      lead={<p>신청하지 않은 사람을 운영자가 명단에 넣어요.</p>}
      after={hasConsent(formFields) ? <p>동의 질문은 비워 두어요. 참가자가 내 정보에서 신청을 고칠 때 직접 답해요.</p> : null}
      submitLabel="참가자 추가"
      pending={save.isPending}
      failure={failure}
      fieldErrors={fieldErrors}
      cancel={
        <Link className="scene-button scene-button--secondary scene-button--size-40" to={`/events/${eventId}/participants`}>
          그만두기
        </Link>
      }
      onSubmit={(answers, draft) => {
        setFailure(null);
        setFieldErrors(new Map());
        const nameItem = answers.find((item) => item.fieldId === nameId);
        const name = nameItem && "text" in nameItem ? nameItem.text.trim() : "";
        save.mutate(answers, {
          onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: ["events", eventId] });
            onAdded(result, name);
          },
          onError: (error) => {
            if (isApiError(error, "APPLICATION_ALREADY_EXISTS")) {
              const existing = typeof error.extensions.applicationId === "string" ? error.extensions.applicationId : null;
              const withdrawn = error.extensions.status === "WITHDRAWN";
              if (phoneId) setFieldErrors(new Map([[phoneId, "이미 이 전화번호의 참가자가 있어요."]]));
              setFailure(
                <>
                  {withdrawn
                    ? "이 전화번호의 신청은 취소돼 있어요. 참가 현황의 취소 목록에서 되돌린 뒤 신청을 고쳐 주세요."
                    : "이 전화번호로 이미 신청한 사람이 있어요. 새로 넣지 않고 그 신청을 고쳐 주세요."}{" "}
                  {existing ? <Link to={`/events/${eventId}/participants/${existing}`}>그 신청 열기</Link> : null}
                </>,
              );
              return;
            }
            if (isApiError(error, "APPLICATION_VALIDATION_FAILED", "VALIDATION_FAILED")) {
              draft.refuseRange();
              draft.setShowAll(true);
              setFailure("입력 내용을 확인해 주세요.");
              return;
            }
            if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
              setFailure("끝났거나 보관된 행사에는 참가자를 추가할 수 없어요.");
              return;
            }
            if (isApiError(error, "FORBIDDEN")) {
              setFailure("참가자를 추가할 권한이 없어요.");
              return;
            }
            setFailure("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
          },
        });
      }}
    />
  );
}

function TemporaryPin({ eventId, added, onNext }: { eventId: string; added: { result: ParticipantAdded; name: string }; onNext: () => void }) {
  const address = `${window.location.origin}/participate/${eventId}`;
  return (
    <section className="operator-answers__pin" aria-labelledby="added-title">
      <h2 id="added-title">{added.name || "참가자"}님을 추가했어요</h2>
      <p>임시 번호예요. 이 화면을 벗어나면 다시 볼 수 없어요. 참가자에게 전해 주세요.</p>
      <p className="operator-answers__pin-number" aria-label="임시 번호">
        {added.result.temporaryPin}
      </p>
      <p>
        참가자는 참가자 주소({address})에서 이름·전화번호·이 번호로 들어와 새 번호 6자리를 정해요. 번호를 잊으면 참가 현황의 수정에서 6자리를 다시 초기화할 수 있어요.
      </p>
      <div className="operator-answers__actions">
        <Link
          className="scene-button scene-button--primary scene-button--size-40"
          to={`/events/${eventId}/participants/${added.result.applicationId}`}
          state={{ edited: "added" }}
        >
          신청 보기
        </Link>
        <Button type="button" variant="secondary" size={40} onClick={onNext}>
          한 명 더 추가
        </Button>
      </div>
    </section>
  );
}
