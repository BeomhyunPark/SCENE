import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import type { ApplicationAnswer } from "../../api/applications";
import { isApiError } from "../../api/errors";
import type { FormField } from "../../api/forms";
import { changeParticipantPin, logoutParticipant } from "../../api/participant";
import {
  getParticipantApplication,
  reviseParticipantApplication,
  type ParticipantApplication,
} from "../../api/participantApplication";
import { reloadQuery } from "../../api/queryClient";
import { queryKeys } from "../../api/queryKeys";
import { Button } from "../Button";
import { formatAnswer, NO_ANSWER } from "../answerDisplay";
import { AnswerInput } from "../apply/AnswerInput";
import { PinFields } from "../apply/PinFields";
import { toAnswerItems, toRawAnswers, visibleFields } from "../apply/answerModel";
import { lockWait, pinInput, pinProblem } from "../apply/pinRules";
import { useAnswerDraft } from "../apply/useAnswerDraft";
import { formatSubmittedAt } from "../eventFormat";
import { EmptyNote, HomeCard } from "./HomeCard";
import { useParticipantFeed } from "./participantFeed";
import { participantPath } from "./participantTabs";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

type MeNotice = { saved?: boolean; closed?: boolean };

/**
 * 내 정보 tab (#427, DEC-078 §4·§6): the answers as submitted, "고치기" while edits are open
 * (`/participate/{eventId}/me/edit`), the six-digit number and logout. The application reloads when
 * `updates.application` changes, which a save here also causes.
 */
export function MeTab({ onLeave }: { onLeave: () => void }) {
  const { eventId } = useParticipantFeed();
  return (
    <Routes>
      <Route index element={<MyInfo onLeave={onLeave} />} />
      <Route path="edit" element={<EditApplication />} />
      <Route path="*" element={<Navigate to={participantPath(eventId, "me")} replace />} />
    </Routes>
  );
}

function useApplicationQuery(eventId: string) {
  const query = useQuery({
    queryKey: queryKeys.participantApplication(eventId),
    queryFn: ({ signal }) => getParticipantApplication(signal),
    ...participantCardQuery,
    // Closing edits raises no `updates` value (only a new revision does), so opening the tab reads again.
    refetchOnMount: "always",
  });
  useSessionGuard(query.error);
  return query;
}

function MyInfo({ onLeave }: { onLeave: () => void }) {
  const notice = (useLocation().state ?? {}) as MeNotice;
  return (
    <div className="participant-tab">
      {/* fe-handoff §5: a user's own screen does not call them by name (#495). */}
      <h1 className="participant-tab__title">내 정보</h1>
      {notice.saved ? (
        <p className="participant-tab__done" role="status">
          신청을 고쳤어요.
        </p>
      ) : null}
      {notice.closed ? (
        <p className="participant-gate__error" role="alert">
          지금은 신청을 고칠 수 없어서 저장하지 못했어요.
        </p>
      ) : null}
      <MyApplication />
      <PinChange />
      <Logout onLeave={onLeave} />
    </div>
  );
}

function MyApplication() {
  const { eventId } = useParticipantFeed();
  const query = useApplicationQuery(eventId);
  const data = query.data;

  if (!data) {
    if (query.isPending) {
      return (
        <HomeCard title="내 신청">
          <EmptyNote>불러오는 중이에요.</EmptyNote>
        </HomeCard>
      );
    }
    if (isApiError(query.error, "RESOURCE_NOT_FOUND")) {
      return (
        <HomeCard title="내 신청">
          <EmptyNote>신청이 없어요. 신청을 취소했다면 운영진에게 물어봐 주세요.</EmptyNote>
        </HomeCard>
      );
    }
    return (
      <HomeCard title="내 신청">
        <EmptyNote>신청을 불러오지 못했어요.</EmptyNote>
        <Button type="button" variant="secondary" size={40} loading={query.isFetching} onClick={() => void reloadQuery(query)}>
          다시 시도
        </Button>
      </HomeCard>
    );
  }

  const submitted = data.submittedAt ? formatSubmittedAt(data.submittedAt) : "";
  return (
    <HomeCard
      title="내 신청"
      failed={query.isError}
      action={
        data.acceptingEdits ? (
          <Link className="participant-card__link" to={participantPath(eventId, "me", "edit")}>
            고치기
          </Link>
        ) : null
      }
    >
      <AnswerList application={data} />
      {submitted ? <p className="participant-card__meta">{submitted} 기준</p> : null}
      {data.acceptingEdits ? null : (
        <p className="participant-card__meta">지금은 신청을 고칠 수 없어요. 고칠 것이 있으면 운영진에게 말해 주세요.</p>
      )}
    </HomeCard>
  );
}

function AnswerList({ application }: { application: ParticipantApplication }) {
  const values = new Map(application.answers.map((answer) => [answer.fieldId, answer.value]));
  const shown = visibleFields(application.fields, toRawAnswers(application.fields, application.answers));
  return (
    <dl className="participant-answers">
      {shown.map((field) => {
        const value = values.get(field.fieldId);
        return (
          <div key={field.fieldId} className="participant-answers__row">
            <dt className="participant-answers__label">{field.label}</dt>
            <dd className="participant-answers__value">{value ? formatAnswer(asAnswer(field, value)) : NO_ANSWER}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function asAnswer(field: FormField, value: Record<string, unknown>): ApplicationAnswer {
  return {
    fieldId: field.fieldId,
    kind: field.kind,
    systemKey: field.systemKey,
    label: field.label,
    position: field.position,
    answerType: field.answerType,
    hidden: false,
    config: field.config,
    value,
    contact: false,
    withheld: false,
  };
}

/**
 * The edit form. It starts from the revision read when it opened and keeps it while the person types,
 * even if a poll reloads the application; a conflict on save reloads and starts again from the newer one.
 */
function EditApplication() {
  const { eventId } = useParticipantFeed();
  const query = useApplicationQuery(eventId);
  const [base, setBase] = useState<ParticipantApplication | null>(query.data ?? null);
  const [conflict, setConflict] = useState(false);
  if (base === null && query.data) setBase(query.data);
  const start = base ?? query.data ?? null;
  const back = participantPath(eventId, "me");

  if (!start) {
    if (query.isPending) return <EmptyNote>불러오는 중이에요.</EmptyNote>;
    return <Navigate to={back} replace />;
  }
  if (!start.acceptingEdits) return <Navigate to={back} replace state={{ closed: true } satisfies MeNotice} />;
  return (
    <EditForm
      key={`${start.applicationId}-${start.revision}`}
      eventId={eventId}
      application={start}
      conflict={conflict}
      onConflict={(next) => {
        setConflict(true);
        setBase(next);
      }}
    />
  );
}

function EditForm({
  eventId,
  application,
  conflict,
  onConflict,
}: {
  eventId: string;
  application: ParticipantApplication;
  conflict: boolean;
  onConflict: (next: ParticipantApplication) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fields = application.fields;
  const draft = useAnswerDraft(fields, toRawAnswers(fields, application.answers));
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  const back = participantPath(eventId, "me");
  const appKey = queryKeys.participantApplication(eventId);

  const save = useMutation({
    mutationFn: () =>
      reviseParticipantApplication({ expectedRevision: application.revision, answers: toAnswerItems(fields, draft.values) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(appKey, saved);
      // A new name shows in the greeting and the 내 조 card.
      void queryClient.invalidateQueries({ queryKey: queryKeys.participantMe(eventId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.participantHome(eventId) });
      navigate(back, { state: { saved: true } satisfies MeNotice });
    },
    onError: async (error) => {
      setFieldErrors(new Map());
      if (isApiError(error, "EDITS_CLOSED")) {
        queryClient.setQueryData<ParticipantApplication>(appKey, (current) => (current ? { ...current, acceptingEdits: false } : current));
        void queryClient.invalidateQueries({ queryKey: appKey });
        navigate(back, { replace: true, state: { closed: true } satisfies MeNotice });
        return;
      }
      if (isApiError(error, "CONCURRENT_MODIFICATION")) {
        try {
          const next = await queryClient.fetchQuery({ queryKey: appKey, queryFn: ({ signal }) => getParticipantApplication(signal) });
          onConflict(next);
        } catch {
          setFailure("다른 곳에서 신청이 바뀌었어요. 화면을 새로 고친 뒤 다시 고쳐 주세요.");
        }
        return;
      }
      if (isApiError(error, "APPLICATION_VALIDATION_FAILED", "VALIDATION_FAILED")) {
        const known = new Map(
          (error.errors ?? []).filter((item) => fields.some((field) => field.fieldId === item.field)).map((item) => [item.field, "입력 내용을 확인해 주세요."]),
        );
        setFieldErrors(known);
        draft.refuseRange();
        draft.setShowAll(true);
        setFailure("입력 내용을 확인해 주세요.");
        return;
      }
      if (isApiError(error, "RESOURCE_NOT_FOUND")) {
        setFailure("신청이 없어서 저장하지 못했어요. 운영진에게 물어봐 주세요.");
        return;
      }
      if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
        setFailure("행사가 끝나서 신청을 고칠 수 없어요.");
        return;
      }
      setFailure("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    },
  });

  return (
    <div className="participant-tab">
      <h1 className="participant-tab__title">신청 고치기</h1>
      {conflict ? (
        <p className="participant-gate__error" role="alert">
          다른 곳에서 신청이 바뀌었어요. 바뀐 내용을 불러왔으니 확인하고 다시 고쳐 주세요.
        </p>
      ) : (
        <p className="participant-gate__body">고칠 답을 바꾸고 저장해 주세요. (필수) 표시는 꼭 답해야 해요.</p>
      )}
      <form
        className="participant-gate__form participant-tab__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (save.isPending) return;
          setFailure(null);
          if (draft.firstProblem) {
            draft.setShowAll(true);
            document.getElementById(`field-${draft.firstProblem.fieldId}`)?.focus();
            return;
          }
          save.mutate();
        }}
      >
        <div className="participant-gate__fields">
          {draft.shown.map((field) =>
            field.systemKey === "PHONE" ? (
              <PhoneLocked key={field.fieldId} field={field} value={draft.values[field.fieldId]?.text ?? ""} />
            ) : (
              <AnswerInput
                key={field.fieldId}
                {...draft.inputProps(field)}
                error={draft.inputProps(field).error ?? fieldErrors.get(field.fieldId) ?? null}
              />
            ),
          )}
        </div>
        {draft.showAll && draft.firstProblem ? (
          <p className="participant-gate__error">답하지 않았거나 확인이 필요한 질문이 있어요.</p>
        ) : null}
        {failure ? (
          <p className="participant-gate__error" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="participant-gate__actions">
          <Button type="submit" variant="primary" size={40} loading={save.isPending}>
            저장하기
          </Button>
          <Link className="scene-button scene-button--secondary scene-button--size-40" to={back}>
            그만두기
          </Link>
        </div>
      </form>
    </div>
  );
}

/** The phone is who the person is (DEC-078 §1), so it is shown but cannot be changed here. */
function PhoneLocked({ field, value }: { field: FormField; value: string }) {
  const id = `field-${field.fieldId}`;
  return (
    <div className="participant-gate__field">
      <label className="participant-gate__label" htmlFor={id}>
        {field.label}
      </label>
      <input id={id} className="participant-gate__input" value={value} readOnly aria-describedby={`${id}-locked`} />
      <p id={`${id}-locked`} className="participant-gate__help">
        전화번호는 고칠 수 없어요. 바꿔야 하면 운영진에게 말해 주세요.
      </p>
    </div>
  );
}

function PinChange() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: () => changeParticipantPin({ currentPin: current, newPin: pin }),
    onSuccess: () => {
      setDone(true);
      setOpen(false);
      setCurrent("");
      setPin("");
      setPinAgain("");
      setTried(false);
    },
  });
  // The server also refuses digits inside the phone; the screen does not hold the phone here.
  const pinError = pinProblem(pin, "");
  const againError = pinAgain !== pin ? "두 번호가 달라요." : null;
  const currentError = current.length === 6 ? null : "지금 쓰는 숫자 6자리를 넣어 주세요.";

  return (
    <HomeCard title="들어올 때 쓰는 번호">
      <EmptyNote>이름, 전화번호와 함께 다시 들어올 때 써요.</EmptyNote>
      {done ? (
        <p className="participant-tab__done" role="status">
          번호를 바꿨어요. 다른 휴대폰에서는 새 번호로 다시 들어와 주세요.
        </p>
      ) : null}
      {open ? (
        <form
          className="participant-gate__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (change.isPending) return;
            setTried(true);
            if (currentError || pinError || againError) return;
            change.mutate();
          }}
        >
          <div className="participant-gate__field">
            <label className="participant-gate__label" htmlFor="me-current-pin">
              지금 숫자 6자리
            </label>
            <input
              id="me-current-pin"
              className="participant-gate__input"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              value={current}
              onChange={(event) => setCurrent(pinInput(event.target.value))}
            />
            {tried && currentError ? <p className="participant-gate__error">{currentError}</p> : null}
          </div>
          <PinFields
            title="새 숫자 6자리"
            intro="다음부터 이 번호로 들어와요. 남에게 알려 주지 마세요."
            pin={pin}
            pinAgain={pinAgain}
            pinError={tried || pin.length === 6 ? pinError : null}
            againError={tried || pinAgain.length === 6 ? againError : null}
            onPin={setPin}
            onPinAgain={setPinAgain}
          />
          {change.isError ? (
            <p className="participant-gate__error" role="alert">
              {pinFailure(change.error)}
            </p>
          ) : null}
          <div className="participant-gate__actions">
            <Button type="submit" variant="primary" size={40} loading={change.isPending}>
              번호 바꾸기
            </Button>
            <Button type="button" variant="secondary" size={40} onClick={() => setOpen(false)}>
              그만두기
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size={40}
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
        >
          숫자 6자리 바꾸기
        </Button>
      )}
    </HomeCard>
  );
}

function pinFailure(error: unknown): string {
  if (isApiError(error, "PARTICIPANT_LOGIN_FAILED")) return "지금 숫자 6자리가 맞지 않아요.";
  if (isApiError(error, "PARTICIPANT_PIN_WEAK")) return "쓸 수 없는 번호예요. 다른 숫자 6자리를 정해 주세요.";
  if (isApiError(error, "PARTICIPANT_LOGIN_LOCKED")) {
    return `여러 번 틀려서 잠겼어요. ${lockWait(error.extensions.retryAfterSeconds)} 뒤에 다시 해 주세요.`;
  }
  return "바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function Logout({ onLeave }: { onLeave: () => void }) {
  const [failed, setFailed] = useState(false);
  const logout = useMutation({ mutationFn: logoutParticipant, onSuccess: onLeave, onError: () => setFailed(true) });
  return (
    <div className="participant-tab__logout">
      {failed ? <p className="participant-gate__error">나가지 못했어요. 잠시 후 다시 시도해 주세요.</p> : null}
      <Button
        type="button"
        variant="secondary"
        size={40}
        loading={logout.isPending}
        onClick={() => {
          setFailed(false);
          logout.mutate();
        }}
      >
        로그아웃
      </Button>
    </div>
  );
}
