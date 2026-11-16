import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import calendarCheck from "../assets/event-home/calendar-check.svg";
import type { EventDetail } from "../api/events";
import { isApiError } from "../api/errors";
import type { FieldInput, FormDetail, FormField, FormSetup } from "../api/forms";
import {
  addField,
  createForm,
  deleteField,
  getForm,
  listForms,
  putSetup,
  reorderFields,
  setAccepting,
  updateField,
} from "../api/forms";
import { activateEvent } from "../api/lifecycle";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { FormPreview } from "./formBuilder/FormPreview";
import { QuestionEditor } from "./formBuilder/QuestionEditor";
import { SetupCard } from "./formBuilder/SetupCard";
import { WordingEditor } from "./formBuilder/WordingEditor";
import {
  TYPE_LABELS,
  conditionSummary,
  draftFromField,
  emptyDraft,
  isConditionTarget,
  toInput,
  type QuestionDraft,
} from "./formBuilder/questionDraft";
import { eventContext, lifecycleLabel } from "./eventFormat";
import "./EventHome.css";
import "./EventRegistrationSetup.css";
import "./formBuilder/QuestionEditor.css";

const LENGTH_COPY = "질문을 1–200자로 써 주세요.";
const LOCKED_COPY = "신청이 들어와서 질문 유형, 보기 삭제, 표시 조건은 바꿀 수 없어요. 필요 없는 질문은 숨겨 주세요.";
const CONDITION_COPY = "표시 조건은 앞에 있는 선택형·예/아니오 질문만 가리킬 수 있어요.";

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
  const allFields = [...(form.data?.fields ?? [])].sort((left, right) => left.position - right.position);
  // A generated question the setup turned off stays stored but is not listed (DEC-070).
  const fields = allFields.filter((field) => field.presetActive !== false);
  const cohort = allFields.find((field) => field.systemKey === "COHORT");
  const locked = form.data?.locked ?? false;
  const [editing, setEditing] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [banner, setBanner] = useState("");
  const [setupError, setSetupError] = useState("");
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<null | "open" | { remove: FormField }>(null);
  const draftStatus = event.lifecycleStatus === "DRAFT";
  const context = eventContext(event);

  function remember(detail: FormDetail) {
    queryClient.setQueryData(queryKeys.form(eventId, detail.formId), detail);
    queryClient.setQueryData(queryKeys.forms(eventId, 0), {
      items: [{ formId: detail.formId, acceptingApplications: detail.acceptingApplications }],
      page: forms.data?.page ?? { number: 0, size: 50, totalItems: 1, totalPages: 1 },
    });
  }

  async function afterFailure(caught: unknown, action: "write" | "activate", inEditor = false) {
    const copy = failureCopy(caught, action);
    if (inEditor) setFieldError(copy);
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

  async function saveQuestion(draft: QuestionDraft, field: FormField | null) {
    if (!form.data) return;
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      const input = toInput(draft);
      remember(
        field
          ? await updateField(eventId, form.data.formId, field.fieldId, input)
          : await addField(eventId, form.data.formId, input),
      );
      setEditing(null);
    } catch (caught) {
      await afterFailure(caught, "write", true);
    } finally {
      setPending(false);
    }
  }

  async function saveSetup(setup: FormSetup) {
    if (!form.data) return;
    setBanner("");
    setSetupError("");
    setPending(true);
    try {
      remember(await putSetup(eventId, form.data.formId, setup));
    } catch (caught) {
      setSetupError(setupFailureCopy(caught));
      if (isMissing(caught)) await reloadQuery(forms);
    } finally {
      setPending(false);
    }
  }

  async function saveWording(field: FormField, changes: Partial<FieldInput>) {
    if (!form.data) return;
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      remember(await updateField(eventId, form.data.formId, field.fieldId, changes));
      setEditing(null);
    } catch (caught) {
      await afterFailure(caught, "write", true);
    } finally {
      setPending(false);
    }
  }

  async function setHidden(field: FormField, hidden: boolean) {
    if (!form.data) return;
    setBanner("");
    setPending(true);
    try {
      remember(await updateField(eventId, form.data.formId, field.fieldId, { hidden }));
    } catch (caught) {
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  /** Every question moves, base questions included. Turned-off generated questions keep their place. */
  async function move(field: FormField, step: -1 | 1) {
    if (!form.data) return;
    const neighbor = fields[fields.indexOf(field) + step];
    if (!neighbor) return;
    const ids = allFields.map((item) => item.fieldId);
    const from = ids.indexOf(field.fieldId);
    const to = ids.indexOf(neighbor.fieldId);
    ids.splice(from, 1);
    ids.splice(to, 0, field.fieldId);
    setBanner("");
    setPending(true);
    try {
      remember(await reorderFields(eventId, form.data.formId, ids));
    } catch (caught) {
      await afterFailure(caught, "write");
    } finally {
      setPending(false);
    }
  }

  async function removeQuestion(field: FormField) {
    if (!form.data) return;
    setDialog(null);
    setBanner("");
    setFieldError("");
    setPending(true);
    try {
      await deleteField(eventId, form.data.formId, field.fieldId);
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
        {form.data && canWrite ? (
          <SetupCard
            startDate={event.startDate}
            endDate={event.endDate}
            saved={form.data.setup}
            cohortOn={cohort ? !cohort.hidden : false}
            locked={locked}
            pending={pending}
            error={setupError}
            onSave={(setup) => void saveSetup(setup)}
            onCohort={(on) => {
              if (cohort) void setHidden(cohort, !on);
            }}
          />
        ) : null}
        <div className="registration-setup__grid">
          <section
            className="registration-setup__panel registration-setup__panel--half"
            aria-labelledby="registration-fields-title"
          >
            <div className="registration-setup__heading">
              <h3 id="registration-fields-title">받을 정보</h3>
              {form.data ? <span>{fields.length}개</span> : null}
            </div>
            {form.data && locked ? <p className="registration-setup__note">{LOCKED_COPY}</p> : null}
            {form.data ? (
              <ul className="registration-setup__fields">
                {fields.map((field, index) =>
                  editing === field.fieldId ? (
                    <li key={field.fieldId}>
                      {field.kind === "SYSTEM" || field.presetKey ? (
                        <WordingEditor
                          field={field}
                          pending={pending}
                          serverError={fieldError}
                          onSave={(changes) => void saveWording(field, changes)}
                          onCancel={() => {
                            setEditing(null);
                            setFieldError("");
                          }}
                        />
                      ) : (
                        <QuestionEditor
                          initial={draftFromField(field)}
                          isNew={false}
                          locked={locked}
                          targets={fields.slice(0, index).filter(isConditionTarget)}
                          pending={pending}
                          serverError={fieldError}
                          onSave={(draft) => void saveQuestion(draft, field)}
                          onCancel={() => {
                            setEditing(null);
                            setFieldError("");
                          }}
                        />
                      )}
                    </li>
                  ) : (
                    <li key={field.fieldId} className="registration-setup__question">
                      <div className="registration-setup__summary">
                        <span className="registration-setup__label">{field.label}</span>
                        {field.kind === "SYSTEM" ? (
                          <span className="registration-setup__chip">기본 항목</span>
                        ) : (
                          <>
                            {field.presetKey ? <span className="registration-setup__chip">자동</span> : null}
                            <span className="registration-setup__chip">{TYPE_LABELS[field.answerType]}</span>
                            {field.required ? <span className="registration-setup__chip">필수</span> : null}
                          </>
                        )}
                        {field.hidden ? (
                          <span className="registration-setup__chip">{isToggle(field) ? "꺼짐" : "숨김"}</span>
                        ) : null}
                      </div>
                      {field.description ? (
                        <p className="registration-setup__condition">{field.description}</p>
                      ) : null}
                      {field.config.options ? (
                        <p className="registration-setup__condition">
                          보기: {optionSummary(field)}
                        </p>
                      ) : null}
                      {field.showWhen ? (
                        <p className="registration-setup__condition">{conditionSummary(field.showWhen, allFields)} 보여요</p>
                      ) : null}
                      {canWrite && editing === null ? (
                        <div className="registration-setup__actions">
                          <Button
                            type="button"
                            variant="tertiary"
                            size={32}
                            aria-label={`${field.label} 위로`}
                            disabled={pending || index === 0}
                            onClick={() => void move(field, -1)}
                          >
                            위로
                          </Button>
                          <Button
                            type="button"
                            variant="tertiary"
                            size={32}
                            aria-label={`${field.label} 아래로`}
                            disabled={pending || index === fields.length - 1}
                            onClick={() => void move(field, 1)}
                          >
                            아래로
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size={32}
                            aria-label={`${field.label} 수정`}
                            onClick={() => {
                              setFieldError("");
                              setEditing(field.fieldId);
                            }}
                          >
                            수정
                          </Button>
                          {isToggle(field) ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size={32}
                              aria-label={`${field.label} ${field.hidden ? "켜기" : "끄기"}`}
                              disabled={pending}
                              onClick={() => void setHidden(field, !field.hidden)}
                            >
                              {field.hidden ? "켜기" : "끄기"}
                            </Button>
                          ) : null}
                          {field.kind === "CUSTOM" && !field.presetKey ? (
                            locked ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size={32}
                                aria-label={`${field.label} ${field.hidden ? "다시 보이기" : "숨기기"}`}
                                onClick={() => void setHidden(field, !field.hidden)}
                              >
                                {field.hidden ? "다시 보이기" : "숨기기"}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="danger-outline"
                                size={32}
                                aria-label={`${field.label} 삭제`}
                                onClick={() => setDialog({ remove: field })}
                              >
                                삭제
                              </Button>
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            ) : null}
            {form.data && canWrite && editing === "new" ? (
              <QuestionEditor
                initial={emptyDraft({ startDate: event.startDate, endDate: event.endDate })}
                isNew
                locked={locked}
                targets={fields.filter(isConditionTarget)}
                pending={pending}
                serverError={fieldError}
                onSave={(draft) => void saveQuestion(draft, null)}
                onCancel={() => {
                  setEditing(null);
                  setFieldError("");
                }}
              />
            ) : null}
            {form.data && canWrite && editing === null ? (
              <div className="registration-setup__manual">
                <p className="registration-setup__note">설정에 없는 질문이 필요하면 직접 만들 수 있어요.</p>
                <Button
                  type="button"
                  variant="tertiary"
                  size={40}
                  onClick={() => {
                    setFieldError("");
                    setEditing("new");
                  }}
                >
                  직접 질문 추가
                </Button>
              </div>
            ) : null}
          </section>
          {form.data ? <FormPreview fields={fields} /> : null}
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
      {dialog !== null && dialog !== "open" ? (
        <ConfirmDialog
          title="질문을 삭제할까요?"
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button type="button" variant="tertiary" size={40} onClick={() => setDialog(null)}>
                닫기
              </Button>
              <Button type="button" variant="danger" size={40} onClick={() => void removeQuestion(dialog.remove)}>
                삭제
              </Button>
            </>
          }
        >
          <p>&lsquo;{dialog.remove.label}&rsquo; 질문이 신청서에서 빠져요.</p>
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

/** 또래 and generated questions are turned on and off; they are never deleted. */
function isToggle(field: FormField): boolean {
  return field.systemKey === "COHORT" || field.presetKey !== null;
}

function optionSummary(field: FormField): string {
  const labels = (field.config.options ?? []).filter((option) => !option.hidden).map((option) => option.label);
  return labels.length > 6 ? `${labels.slice(0, 6).join(", ")} 외 ${labels.length - 6}개` : labels.join(", ");
}

function setupFailureCopy(caught: unknown): string {
  if (isApiError(caught, "FORBIDDEN")) return "신청서를 바꿀 권한이 없어요.";
  if (isApiError(caught, "FIELD_LOCKED")) {
    return "신청이 들어온 뒤에는 이미 받은 질문의 표시 조건이 바뀌는 설정은 저장할 수 없어요. 참석 방식 질문을 통째로 없애거나 새로 만드는 변경이 여기에 해당해요.";
  }
  if (isApiError(caught, "CONFLICT")) {
    return "직접 만든 질문이 이 설정으로 사라지는 질문이나 보기에 조건을 걸고 있어요. 그 조건을 먼저 바꿔 주세요.";
  }
  if (isApiError(caught, "VALIDATION_FAILED")) {
    const field = caught.errors?.[0]?.field;
    if (field === "eventPeriod" || field === "schedule") {
      return "행사 날짜가 바뀌었어요. 화면을 새로 고친 뒤 다시 저장해 주세요.";
    }
    if (field === "fields") return "질문은 100개까지 만들 수 있어요.";
  }
  return "설정을 저장하지 못했어요. 다시 시도해 주세요.";
}

function failureCopy(caught: unknown, action: "write" | "activate"): string {
  if (isApiError(caught, "FORBIDDEN", "OVERRIDE_REQUIRED")) {
    return action === "activate" ? "행사 Owner만 시작할 수 있어요." : "신청서를 바꿀 권한이 없어요.";
  }
  if (isApiError(caught, "VALIDATION_FAILED")) {
    const field = caught.errors?.[0]?.field;
    if (field === "label" || field === "customLabel") return LENGTH_COPY;
    if (field === "showWhen" || field === "fieldIds") return CONDITION_COPY;
    if (field === "description") return "설명은 500자까지 쓸 수 있어요.";
    if (field === "fields") return "질문은 100개까지 만들 수 있어요.";
    if (field === "config") return "답변 설정을 확인해 주세요. 보기는 1–50개, 보기 문구는 1–100자, 안내 문구는 100자까지예요.";
  }
  if (isApiError(caught, "FIELD_LOCKED")) return LOCKED_COPY;
  if (isApiError(caught, "CONFLICT")) {
    return "지금은 이렇게 바꿀 수 없어요. 다른 질문의 표시 조건에 쓰이는 질문이거나, 신청서 설정을 따르는 질문이에요.";
  }
  if (isApiError(caught, "INVALID_STATE_TRANSITION")) return "진행 중인 행사에서만 신청을 열 수 있어요.";
  if (isApiError(caught, "CONCURRENT_MODIFICATION")) return "다른 변경이 먼저 반영됐어요. 다시 확인해 주세요.";
  if (isMissing(caught)) return "신청서를 찾을 수 없어요.";
  return "저장하지 못했어요. 다시 시도해 주세요.";
}

function isMissing(caught: unknown): boolean {
  return isApiError(caught) && (caught.code === "RESOURCE_NOT_FOUND" || caught.status === 404);
}
