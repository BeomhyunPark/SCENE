import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { getPublicForm, submitApplication, type SubmittedApplication } from "../api/applications";
import { isApiError } from "../api/errors";
import type { FormField } from "../api/forms";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { CompletionNotice } from "./CompletionNotice";
import { ParticipantFrame } from "./ParticipantFrame";
import { AnswerInput } from "./apply/AnswerInput";
import { RangeSummary } from "./apply/RangeSummary";
import { optionView } from "./apply/optionView";
import { ARRIVAL, DEPARTURE, REVERSED_COPY, departureFieldId, rangeProblem } from "./apply/attendanceRange";
import { PinFields } from "./apply/PinFields";
import { pinProblem } from "./apply/pinRules";
import {
  problemFor,
  prune,
  toAnswerItems,
  visibleFields,
  type RawAnswer,
  type RawAnswers,
} from "./apply/answerModel";

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
    return <ApplyDone eventId={eventId} submitted={submitted} />;
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
  const [values, setValues] = useState<RawAnswers>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The server also refuses a departure before the arrival (400). It names no field, so a refusal
  // while both are answered is shown on 출발 until either one changes.
  const [rangeRefused, setRangeRefused] = useState(false);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [pinRefused, setPinRefused] = useState<string | null>(null);
  const departureId = departureFieldId(fields);
  const submit = useMutation({
    mutationFn: () => submitApplication(eventId, formId, toAnswerItems(fields, values), pin),
    onSuccess: (result) => {
      setFailure(null);
      onSubmitted(result);
    },
    onError: (error) => {
      setFailure(submitFailure(error));
      if (isApiError(error, "PARTICIPANT_PIN_WEAK")) setPinRefused("쓸 수 없는 번호예요. 다른 숫자 6자리를 정해 주세요.");
      if (isApiError(error, "APPLICATION_VALIDATION_FAILED") && departureId && shown.some((field) => field.fieldId === departureId)) {
        setRangeRefused(true);
        setShowAll(true);
      }
    },
  });
  const shown = visibleFields(fields, values);
  const problems = new Map(
    shown.map((field) => {
      const own = problemFor(field, values[field.fieldId]);
      if (own || field.fieldId !== departureId) return [field.fieldId, own];
      return [field.fieldId, rangeProblem(fields, values) ?? (rangeRefused ? REVERSED_COPY : null)];
    }),
  );
  const firstProblem = shown.find((field) => problems.get(field.fieldId));
  const phoneField = fields.find((field) => field.systemKey === "PHONE");
  const phone = phoneField ? String(values[phoneField.fieldId]?.text ?? "") : "";
  const pinError = pinRefused ?? pinProblem(pin, phone);
  const againError = pinAgain.length > 0 && pinAgain !== pin ? "두 번호가 달라요." : pinAgain.length === 0 ? "한 번 더 넣어 주세요." : null;

  function change(fieldId: string, next: RawAnswer) {
    const key = fields.find((field) => field.fieldId === fieldId)?.presetKey;
    if (key === ARRIVAL || key === DEPARTURE) setRangeRefused(false);
    setTouched((current) => new Set(current).add(fieldId));
    setValues((current) => prune(fields, { ...current, [fieldId]: next }));
  }

  return (
    <ParticipantFrame title="참가 신청">
      <p className="participant-gate__body">질문에 답해 주세요. (필수) 표시는 꼭 답해야 해요.</p>
      <form
        className="participant-gate__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (submit.isPending) return;
          if (firstProblem) {
            setShowAll(true);
            document.getElementById(`field-${firstProblem.fieldId}`)?.focus();
            return;
          }
          if (pinError || againError) {
            setShowAll(true);
            document.getElementById(pinError ? "apply-pin" : "apply-pin-again")?.focus();
            return;
          }
          submit.mutate();
        }}
      >
        <div className="participant-gate__fields">
          {shown.map((field) => {
            const problem = problems.get(field.fieldId) ?? null;
            const answered = Object.keys(values[field.fieldId] ?? {}).length > 0;
            // An out-of-order range shows at once on 출발, wherever it was caused (도착 changed later).
            const rangeNow = field.fieldId === departureId && rangeProblem(fields, values) !== null;
            const visibleError = showAll || rangeNow || (touched.has(field.fieldId) && answered) ? problem : null;
            return (
              <AnswerInput
                key={field.fieldId}
                field={field}
                {...optionView(field, fields, values)}
                value={values[field.fieldId]}
                error={visibleError}
                onChange={(next) => change(field.fieldId, next)}
                extra={field.fieldId === departureId ? <RangeSummary fields={fields} values={values} /> : null}
              />
            );
          })}
        </div>
        <PinFields
          pin={pin}
          pinAgain={pinAgain}
          pinError={showAll || pin.length === 6 ? pinError : null}
          againError={showAll || pinAgain.length === 6 ? againError : null}
          onPin={(next) => {
            setPinRefused(null);
            setPin(next);
          }}
          onPinAgain={setPinAgain}
        />
        {showAll && (firstProblem || pinError || againError) ? (
          <p className="participant-gate__error">답하지 않았거나 확인이 필요한 질문이 있어요.</p>
        ) : null}
        {failure ? <p className="participant-gate__error">{failure}</p> : null}
        <Button type="submit" variant="primary" size={40} loading={submit.isPending}>
          신청하기
        </Button>
      </form>
    </ParticipantFrame>
  );
}

/**
 * After submit the person is already signed in: the response set the participant session cookie
 * (DEC-078). There is no one-time link; next time they come back through the event's participant
 * address with name, phone and their number.
 */
function ApplyDone({ eventId, submitted }: { eventId: string; submitted: SubmittedApplication }) {
  const address = `${window.location.origin}/participate/${eventId}`;
  return (
    <ParticipantFrame title={submitted.revised ? "신청을 고쳤어요" : "신청했어요"}>
      <CompletionNotice text={submitted.completionNotice} />
      <p className="participant-gate__body">
        다음에 다시 볼 때는 아래 주소에서 이름, 전화번호, 방금 정한 숫자 6자리를 넣고 들어와요. 다른 휴대폰에서도 돼요.
      </p>
      <input className="participant-gate__input" readOnly aria-label="참가자 주소" value={address} />
      <div className="participant-gate__actions">
        <Link className="scene-button scene-button--primary scene-button--size-40" to={`/participate/${eventId}`}>
          내 신청 보기
        </Link>
      </div>
    </ParticipantFrame>
  );
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
  if (isApiError(error, "PARTICIPANT_PIN_WEAK")) return "숫자 6자리를 다시 정해 주세요.";
  if (isApiError(error, "APPLICATION_ALREADY_EXISTS")) {
    return "이 전화번호로 이미 신청했어요. 처음 신청할 때 정한 숫자 6자리를 넣으면 신청이 고쳐져요. 잊었다면 운영진에게 초기화를 부탁해 주세요.";
  }
  if (isApiError(error, "EDITS_CLOSED")) return "이 전화번호로 이미 신청했어요. 지금은 신청을 고칠 수 없어요.";
  if (isApiError(error, "PARTICIPANT_LOGIN_LOCKED")) return "여러 번 틀려서 잠시 신청할 수 없어요. 15분쯤 뒤에 다시 해 주세요.";
  if (isApiError(error, "RATE_LIMITED")) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  if (isApiError(error, "FORM_NOT_FOUND") || isApiError(error, "RESOURCE_NOT_FOUND")) return "신청서를 찾을 수 없어요.";
  return "신청하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
