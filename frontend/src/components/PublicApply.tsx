import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { getPublicForm, submitApplication, type SubmittedApplication } from "../api/applications";
import { isApiError } from "../api/errors";
import type { FormField } from "../api/forms";
import { openParticipantSession } from "../api/participant";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { ParticipantFrame } from "./ParticipantFrame";

export function PublicApply() {
  const { eventId = "", formId = "" } = useParams();
  const form = useQuery({
    queryKey: queryKeys.publicForm(eventId, formId),
    queryFn: ({ signal }) => getPublicForm(eventId, formId, signal),
    enabled: eventId.length > 0 && formId.length > 0,
  });
  const [submitted, setSubmitted] = useState<SubmittedApplication | null>(null);

  if (form.isPending) {
    return (
      <ParticipantFrame title="참가 신청">
        <p className="participant-gate__body">불러오는 중이에요.</p>
      </ParticipantFrame>
    );
  }
  if (form.isError) {
    return (
      <ParticipantFrame title={formTitle(form.error)}>
        <p className="participant-gate__body">{formBody(form.error)}</p>
        {isClosed(form.error) ? null : (
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(form)}>
            다시 시도
          </Button>
        )}
      </ParticipantFrame>
    );
  }
  if (submitted) {
    return <ApplyLink eventId={eventId} submitted={submitted} />;
  }
  const fields = [...form.data.fields].sort((left, right) => left.position - right.position);
  return <ApplyForm eventId={eventId} formId={formId} fields={fields} onSubmitted={setSubmitted} />;
}

function ApplyForm({
  eventId,
  formId,
  fields,
  onSubmitted,
}: {
  eventId: string;
  formId: string;
  fields: FormField[];
  onSubmitted: (submitted: SubmittedApplication) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => submitApplication(eventId, formId, answers(fields, values)),
    onSuccess: (result) => {
      setFailure(null);
      onSubmitted(result);
    },
    onError: (error) => setFailure(submitFailure(error)),
  });
  const ready = fields.every((field) => (required(field) ? textOk(values[field.fieldId] ?? "", field) : optionalOk(values[field.fieldId] ?? "")));

  return (
    <ParticipantFrame title="참가 신청">
      <p className="participant-gate__body">이름과 전화를 적어 주세요.</p>
      <form
        className="participant-gate__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || submit.isPending) return;
          submit.mutate();
        }}
      >
        <div className="participant-gate__fields">
          {fields.map((field) => {
            const value = values[field.fieldId] ?? "";
            const invalid = value.trim() !== "" && !textOk(value, field);
            return (
              <div className="participant-gate__field" key={field.fieldId}>
                <label className="participant-gate__label" htmlFor={`field-${field.fieldId}`}>
                  {field.label}
                </label>
                <input
                  id={`field-${field.fieldId}`}
                  className="participant-gate__input"
                  value={value}
                  autoComplete={field.systemKey === "PHONE" ? "tel" : field.systemKey === "NAME" ? "name" : "off"}
                  aria-invalid={invalid || undefined}
                  onChange={(change) => setValues((current) => ({ ...current, [field.fieldId]: change.target.value }))}
                />
                {invalid ? <p className="participant-gate__error">{fieldHint(field)}</p> : null}
              </div>
            );
          })}
        </div>
        {failure ? <p className="participant-gate__error">{failure}</p> : null}
        <Button type="submit" variant="primary" size={40} disabled={!ready} loading={submit.isPending}>
          신청하기
        </Button>
      </form>
    </ParticipantFrame>
  );
}

function ApplyLink({ eventId, submitted }: { eventId: string; submitted: SubmittedApplication }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const link = `${window.location.origin}/participate/${eventId}#${encodeURIComponent(submitted.accessKey)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function enter() {
    setFailure(null);
    setPending(true);
    try {
      await openParticipantSession(eventId, submitted.accessKey);
      navigate(`/participate/${eventId}`, { replace: true });
    } catch (error) {
      setFailure(isApiError(error, "PARTICIPANT_ACCESS_INVALID") ? "사용할 수 없는 링크예요." : "들어가지 못했어요. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <ParticipantFrame title="신청했어요">
      <p className="participant-gate__body">이 링크만 다시 들어올 수 있어요. 이 화면을 떠나면 링크는 다시 보이지 않아요.</p>
      <input className="participant-gate__input" readOnly aria-label="다시 들어오는 링크" value={link} />
      {copied ? <p className="participant-gate__body">복사했어요.</p> : null}
      {failure ? <p className="participant-gate__error">{failure}</p> : null}
      <div className="participant-gate__actions">
        <Button type="button" variant="secondary" size={40} onClick={() => void copy()}>
          링크 복사
        </Button>
        <Button type="button" variant="primary" size={40} loading={pending} onClick={() => void enter()}>
          들어가기
        </Button>
      </div>
    </ParticipantFrame>
  );
}

function answers(fields: FormField[], values: Record<string, string>): { fieldId: string; text: string }[] {
  return fields.flatMap((field) => {
    const text = (values[field.fieldId] ?? "").trim();
    if (text.length === 0) return [];
    return [{ fieldId: field.fieldId, text }];
  });
}

function required(field: FormField): boolean {
  return field.systemKey === "NAME" || field.systemKey === "PHONE";
}

function textOk(value: string, field: FormField): boolean {
  const text = value.trim();
  if (text.length < 1 || text.length > 200) return false;
  if (field.systemKey !== "PHONE") return true;
  return text.length <= 50 && text.replace(/\D/g, "").length >= 4;
}

function optionalOk(value: string): boolean {
  const text = value.trim();
  return text.length === 0 || text.length <= 200;
}

function fieldHint(field: FormField): string {
  if (field.systemKey === "PHONE") return "전화번호는 숫자 4개 이상이 필요해요.";
  return "200자까지 적을 수 있어요.";
}

function isClosed(error: unknown): boolean {
  return isApiError(error, "FORM_CLOSED") || isApiError(error, "EVENT_ENDED");
}

function formTitle(error: unknown): string {
  if (isApiError(error, "FORM_CLOSED") || isApiError(error, "EVENT_ENDED")) return "신청을 받지 않아요";
  if (isApiError(error, "FORM_NOT_FOUND") || isApiError(error, "RESOURCE_NOT_FOUND")) return "신청서를 찾을 수 없어요";
  return "불러오지 못했어요";
}

function formBody(error: unknown): string {
  if (isApiError(error, "EVENT_ENDED")) return "종료된 행사에는 신청할 수 없어요.";
  if (isApiError(error, "FORM_CLOSED")) return "지금은 신청을 받지 않아요.";
  if (isApiError(error, "FORM_NOT_FOUND") || isApiError(error, "RESOURCE_NOT_FOUND")) return "주소를 다시 확인해 주세요.";
  return "잠시 후 다시 시도해 주세요.";
}

function submitFailure(error: unknown): string {
  if (isApiError(error, "EVENT_ENDED")) return "종료된 행사에는 신청할 수 없어요.";
  if (isApiError(error, "FORM_CLOSED")) return "지금은 신청을 받지 않아요.";
  if (isApiError(error, "APPLICATION_VALIDATION_FAILED")) return "입력 내용을 확인해 주세요.";
  if (isApiError(error, "FORM_NOT_FOUND") || isApiError(error, "RESOURCE_NOT_FOUND")) return "신청서를 찾을 수 없어요.";
  return "신청하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
