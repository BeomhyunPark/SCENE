import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import type { EventDetail } from "../api/events";
import { isApiError } from "../api/errors";
import type { FormDetail } from "../api/forms";
import { addField, createForm, deleteField, getForm, listForms, renameField, setAccepting } from "../api/forms";
import { activateEvent } from "../api/lifecycle";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { FieldPrivacyWarning } from "./FieldPrivacyWarning";
import { OperatorShell } from "./OperatorShell";
import { eventContext, lifecycleLabel } from "./eventFormat";
import "./EventHome.css";
import "./EventRegistrationSetup.css";

const LENGTH_COPY = "질문을 1–200자로 써 주세요.";
const ONE_CUSTOM_COPY = "지금은 추가 질문을 하나만 받을 수 있어요.";

export function EventRegistrationSetup() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <SetupBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function SetupBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const queryClient = useQueryClient();
  const eventId = event.eventId;
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const forms = useQuery({
    queryKey: queryKeys.forms(eventId, 0),
    queryFn: () => listForms(eventId, { page: 0, size: 50 }),
  });
  const formId = forms.data?.items[0]?.formId ?? "";
  const form = useQuery({
    queryKey: queryKeys.form(eventId, formId),
    queryFn: () => getForm(eventId, formId),
    enabled: formId.length > 0,
  });
  const canWrite = permissions.data?.effective.includes("FORM_WRITE") ?? false;
  const ended = event.lifecycleStatus === "ENDED" || event.lifecycleStatus === "ARCHIVED";
  const fields = [...(form.data?.fields ?? [])].sort((left, right) => left.position - right.position);
  const custom = fields.find((field) => field.kind === "CUSTOM");
  const serverLabel = custom?.label ?? null;
  const [trackedLabel, setTrackedLabel] = useState<string | null>(serverLabel);
  const [customDraft, setCustomDraft] = useState(serverLabel ?? "");
  if (trackedLabel !== serverLabel) {
    setTrackedLabel(serverLabel);
    setCustomDraft(serverLabel ?? "");
  }
  const [question, setQuestion] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [banner, setBanner] = useState("");
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<null | "open" | "delete">(null);
  const draftStatus = event.lifecycleStatus === "DRAFT";
  const context = eventContext(event);

  function remember(detail: FormDetail) {
    queryClient.setQueryData(queryKeys.form(eventId, detail.formId), detail);
    queryClient.setQueryData(queryKeys.forms(eventId, 0), {
      items: [{ formId: detail.formId, acceptingApplications: detail.acceptingApplications }],
      page: forms.data?.page ?? { number: 0, size: 50, totalItems: 1, totalPages: 1 },
    });
  }

  async function afterFailure(caught: unknown, action: "write" | "activate") {
    const copy = failureCopy(caught, action);
    if (copy === LENGTH_COPY) setFieldError(copy);
    else setBanner(copy);
    if (isApiError(caught, "INVALID_STATE_TRANSITION") || isApiError(caught, "CONCURRENT_MODIFICATION")) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
    }
    if (isApiError(caught, "VALIDATION_FAILED") && (caught.errors?.length ?? 0) === 0) {
      await reloadQuery(form);
    }
    if (isMissing(caught)) await reloadQuery(forms);
  }

  async function makeForm() {
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      remember(await createForm(eventId));
    } catch (caught) {
      if (isApiError(caught, "CONFLICT")) {
        await reloadQuery(forms);
        return;
      }
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  async function addQuestion(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (!form.data) return;
    const label = readableLabel(question);
    if (!label) {
      setFieldError(LENGTH_COPY);
      return;
    }
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      remember(await addField(eventId, form.data.formId, label));
      setQuestion("");
    } catch (caught) {
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  async function saveQuestion(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (!form.data || !custom) return;
    const label = readableLabel(customDraft);
    if (!label) {
      setFieldError(LENGTH_COPY);
      return;
    }
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      remember(await renameField(eventId, form.data.formId, custom.fieldId, label));
    } catch (caught) {
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  async function removeQuestion() {
    if (!form.data || !custom) return;
    setDialog(null);
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      await deleteField(eventId, form.data.formId, custom.fieldId);
      await reloadQuery(form);
    } catch (caught) {
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  async function openApplications() {
    if (!form.data) return;
    setDialog(null);
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      if (event.lifecycleStatus === "DRAFT") {
        try {
          const result = await activateEvent(eventId, event.lifecycleVersion);
          queryClient.setQueryData<EventDetail>(queryKeys.event(eventId), (current) =>
            current
              ? { ...current, lifecycleStatus: result.lifecycleStatus, lifecycleVersion: result.lifecycleVersion }
              : current,
          );
          await queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
        } catch (caught) {
          await afterFailure(caught, "activate");
          return;
        }
      }
      remember(await setAccepting(eventId, form.data.formId, true));
    } catch (caught) {
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  async function closeApplications() {
    if (!form.data) return;
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      remember(await setAccepting(eventId, form.data.formId, false));
    } catch (caught) {
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  const lead = leadCopy(Boolean(form.data), form.data?.acceptingApplications ?? false, ended);
  const badge = ended ? lifecycleLabel(event.lifecycleStatus) : "설정 중";

  return (
    <OperatorShell
      title={event.name}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventId ? `/events/${eventId}` : undefined}
      eventAreas={["participants"]}
      participantsHref={eventId ? `/events/${eventId}/participants` : undefined}
      framed
      leading={
        <Link className="event-home__back" to={eventId ? `/events/${eventId}/participants` : "/events"} aria-label="참가 운영">
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
          <span className="event-home__badge">{badge}</span>
        </div>
        <section className="event-home__welcome">
          <span className="event-home__mark" aria-hidden="true">
            <img src={calendarCheck} alt="" />
          </span>
          <div className="event-home__welcome-copy">
            <h2>참가 신청을 준비해 보세요.</h2>
            <p>{lead}</p>
          </div>
          {!form.data && canWrite ? (
            <Button type="button" variant="primary" size={40} loading={pending} onClick={() => void makeForm()}>
              신청서 만들기
            </Button>
          ) : null}
          {form.data && canWrite && !ended ? (
            form.data.acceptingApplications ? (
              <Button type="button" variant="secondary" size={40} loading={pending} onClick={() => void closeApplications()}>
                신청 닫기
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size={40}
                loading={pending}
                onClick={() => {
                  if (event.lifecycleStatus === "DRAFT") setDialog("open");
                  else void openApplications();
                }}
              >
                신청 열기
              </Button>
            )
          ) : null}
        </section>
        {banner ? (
          <p className="registration-setup__alert" role="alert">
            {banner}
          </p>
        ) : null}
        {forms.isPending || (formId && form.isPending) ? <p>불러오는 중이에요.</p> : null}
        {forms.isError ? (
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(forms)}>
            다시 시도
          </Button>
        ) : null}
        <div className="registration-setup__grid">
          <section className="registration-setup__panel" aria-labelledby="registration-fields-title">
            <div className="registration-setup__heading">
              <h3 id="registration-fields-title">받을 정보</h3>
              {form.data ? <span>{fields.length}개</span> : null}
            </div>
            {form.data ? (
              <ul className="registration-setup__fields">
                {fields.map((field) =>
                  field.kind === "SYSTEM" ? (
                    <li key={field.fieldId} className="registration-setup__row">
                      <span>{field.label}</span>
                      <span className="registration-setup__chip">기본 항목</span>
                    </li>
                  ) : canWrite ? (
                    <li key={field.fieldId}>
                      <form className="registration-setup__form" onSubmit={(submit) => void saveQuestion(submit)}>
                        <label htmlFor="custom-question">추가 질문</label>
                        <input
                          id="custom-question"
                          value={customDraft}
                          aria-invalid={fieldError.length > 0}
                          onChange={(change) => setCustomDraft(change.target.value)}
                        />
                        <FieldPrivacyWarning label={customDraft} />
                        <div className="registration-setup__actions">
                          <Button type="submit" variant="primary" size={40} loading={pending}>
                            저장
                          </Button>
                          <Button type="button" variant="danger-outline" size={40} onClick={() => setDialog("delete")}>
                            질문 삭제
                          </Button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li key={field.fieldId} className="registration-setup__row">
                      <span>{field.label}</span>
                      <FieldPrivacyWarning label={field.label} />
                    </li>
                  ),
                )}
              </ul>
            ) : null}
            {form.data && custom ? <p className="registration-setup__note">{ONE_CUSTOM_COPY}</p> : null}
            {form.data && !custom && canWrite ? (
              <form className="registration-setup__form" onSubmit={(submit) => void addQuestion(submit)}>
                <label htmlFor="new-question">질문</label>
                <input
                  id="new-question"
                  value={question}
                  aria-invalid={fieldError.length > 0}
                  onChange={(change) => setQuestion(change.target.value)}
                />
                <FieldPrivacyWarning label={question} />
                <Button type="submit" variant="primary" size={40} loading={pending}>
                  추가
                </Button>
              </form>
            ) : null}
            {fieldError ? (
              <p className="registration-setup__alert" role="alert">
                {fieldError}
              </p>
            ) : null}
          </section>
          <article className="registration-setup__inert">
            <h3>신청 기간</h3>
            <p>준비 중</p>
          </article>
          <article className="registration-setup__inert">
            <h3>완료 안내</h3>
            <p>준비 중</p>
          </article>
        </div>
      </div>
      {dialog === "open" ? (
        <ConfirmDialog
          title="행사를 시작할까요?"
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button type="button" variant="tertiary" size={40} onClick={() => setDialog(null)}>
                닫기
              </Button>
              <Button type="button" variant="primary" size={40} onClick={() => void openApplications()}>
                시작하기
              </Button>
            </>
          }
        >
          <p>행사를 시작해야 신청을 열 수 있어요. 지금 시작할까요?</p>
        </ConfirmDialog>
      ) : null}
      {dialog === "delete" ? (
        <ConfirmDialog
          title="질문을 삭제할까요?"
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button type="button" variant="tertiary" size={40} onClick={() => setDialog(null)}>
                닫기
              </Button>
              <Button type="button" variant="danger" size={40} onClick={() => void removeQuestion()}>
                삭제
              </Button>
            </>
          }
        >
          <p>삭제한 질문은 신청서에서 빠져요.</p>
        </ConfirmDialog>
      ) : null}
    </OperatorShell>
  );
}

function leadCopy(hasForm: boolean, accepting: boolean, ended: boolean): string {
  if (ended) return "종료된 행사는 신청을 열 수 없어요.";
  if (!hasForm) return "신청서를 만들어 시작해 보세요.";
  return accepting ? "신청 받는 중" : "공개 전";
}

function readableLabel(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return null;
  return trimmed;
}

function failureCopy(caught: unknown, action: "write" | "activate"): string {
  if (isApiError(caught, "FORBIDDEN", "OVERRIDE_REQUIRED")) {
    return action === "activate" ? "행사 Owner만 시작할 수 있어요." : "신청서를 바꿀 권한이 없어요.";
  }
  if (isApiError(caught, "VALIDATION_FAILED")) {
    const field = caught.errors?.[0]?.field;
    if (field === "label" || field === "customLabel") return LENGTH_COPY;
    if ((caught.errors?.length ?? 0) === 0) return ONE_CUSTOM_COPY;
  }
  if (isApiError(caught, "CONFLICT")) return "기본 항목은 지울 수 없어요.";
  if (isApiError(caught, "INVALID_STATE_TRANSITION")) return "진행 중인 행사에서만 신청을 열 수 있어요.";
  if (isApiError(caught, "CONCURRENT_MODIFICATION")) return "다른 변경이 먼저 반영됐어요. 다시 확인해 주세요.";
  if (isMissing(caught)) return "신청서를 찾을 수 없어요.";
  return "저장하지 못했어요. 다시 시도해 주세요.";
}

function isMissing(caught: unknown): boolean {
  return isApiError(caught) && (caught.code === "RESOURCE_NOT_FOUND" || caught.status === 404);
}
