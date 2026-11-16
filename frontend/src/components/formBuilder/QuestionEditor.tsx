import { useState, type FormEvent } from "react";
import type { AnswerType, FormField } from "../../api/forms";
import { Button } from "../Button";
import { FieldPrivacyWarning } from "../FieldPrivacyWarning";
import { ConditionPicker } from "./ConditionPicker";
import {
  TYPE_LABELS,
  TYPE_ORDER,
  draftProblem,
  hasOptions,
  newOption,
  withAnswerType,
  withIncludeTime,
  type EventPeriod,
  type OptionDraft,
  type QuestionDraft,
} from "./questionDraft";

const LOCKED_TYPE = "신청이 들어와서 유형은 바꿀 수 없어요.";
const LOCKED_OPTION = "신청이 들어와서 지울 수 없어요. 숨기기를 써 주세요.";
const LOCKED_CONDITION = "신청이 들어와서 표시 조건은 바꿀 수 없어요.";

/**
 * Add or edit one CUSTOM question. `targets` are the questions before it that a condition may
 * point at. `locked` is the form's edit lock; it only restricts what already existed.
 */
export function QuestionEditor({
  initial,
  isNew,
  locked,
  period,
  targets,
  pending,
  serverError,
  onSave,
  onCancel,
}: {
  initial: QuestionDraft;
  isNew: boolean;
  locked: boolean;
  period: EventPeriod;
  targets: FormField[];
  pending: boolean;
  serverError: string;
  onSave: (draft: QuestionDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState("");
  const lockExisting = locked && !isNew;
  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const idBase = isNew ? "new-question" : "edit-question";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = draftProblem(draft);
    setProblem(found ?? "");
    if (!found) onSave(draft);
  }

  function changeType(type: AnswerType) {
    setDraft((current) => withAnswerType(current, type, period));
  }

  function updateOption(key: string, patch: Partial<OptionDraft>) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) => (option.key === key ? { ...option, ...patch } : option)),
    }));
  }

  const message = problem || serverError;

  return (
    <form className="question-editor" onSubmit={submit} aria-label={isNew ? "새 질문" : "질문 수정"}>
      <div className="question-editor__row">
        <label htmlFor={`${idBase}-label`}>질문</label>
        <input
          id={`${idBase}-label`}
          value={draft.label}
          aria-invalid={message.length > 0}
          onChange={(change) => set("label", change.target.value)}
        />
        <FieldPrivacyWarning label={draft.label} />
      </div>
      <div className="question-editor__row">
        <label htmlFor={`${idBase}-description`}>설명 (선택)</label>
        <input
          id={`${idBase}-description`}
          value={draft.description}
          onChange={(change) => set("description", change.target.value)}
        />
        <FieldPrivacyWarning label={draft.description} />
      </div>
      <div className="question-editor__inline">
        <div className="question-editor__row">
          <label htmlFor={`${idBase}-type`}>답변 유형</label>
          <select
            id={`${idBase}-type`}
            value={draft.answerType}
            disabled={lockExisting}
            title={lockExisting ? LOCKED_TYPE : undefined}
            onChange={(change) => changeType(change.target.value as AnswerType)}
          >
            {TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <label className="question-editor__check">
          <input type="checkbox" checked={draft.required} onChange={(change) => set("required", change.target.checked)} />
          필수
        </label>
      </div>
      {lockExisting ? <p className="question-editor__hint">{LOCKED_TYPE}</p> : null}

      <TypeSettings draft={draft} idBase={idBase} set={set} />

      {hasOptions(draft.answerType) ? (
        <fieldset className="question-editor__options">
          <legend>보기</legend>
          {draft.options.map((option, index) => {
            const stored = Boolean(option.optionId);
            return (
              <div key={option.key} className="question-editor__option">
                <input
                  aria-label={`보기 ${index + 1}`}
                  value={option.label}
                  onChange={(change) => updateOption(option.key, { label: change.target.value })}
                />
                <input
                  aria-label={`보기 ${index + 1} 묶음`}
                  placeholder="묶음 (예: 1월 22일)"
                  value={option.group}
                  onChange={(change) => updateOption(option.key, { group: change.target.value })}
                />
                {stored ? (
                  <label className="question-editor__check">
                    <input
                      type="checkbox"
                      checked={option.hidden}
                      onChange={(change) => updateOption(option.key, { hidden: change.target.checked })}
                    />
                    숨기기
                  </label>
                ) : null}
                <Button
                  type="button"
                  variant="tertiary"
                  size={32}
                  disabled={locked && stored}
                  title={locked && stored ? LOCKED_OPTION : undefined}
                  aria-label={`보기 ${index + 1} 지우기`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      options: current.options.filter((item) => item.key !== option.key),
                    }))
                  }
                >
                  지우기
                </Button>
                <FieldPrivacyWarning label={option.label} />
                {targets.length > 0 ? (
                  <ConditionPicker
                    id={`${idBase}-option-${option.key}`}
                    label={`보기 ${index + 1} 표시 조건`}
                    value={option.showWhen}
                    targets={targets}
                    disabled={locked && stored}
                    onChange={(next) => updateOption(option.key, { showWhen: next })}
                  />
                ) : null}
              </div>
            );
          })}
          {locked ? <p className="question-editor__hint">{LOCKED_OPTION}</p> : null}
          <Button
            type="button"
            variant="secondary"
            size={32}
            onClick={() => setDraft((current) => ({ ...current, options: [...current.options, newOption()] }))}
          >
            보기 추가
          </Button>
        </fieldset>
      ) : null}

      {targets.length > 0 ? (
        <>
          <ConditionPicker
            id={`${idBase}-condition`}
            label="이 질문을 보여 줄 조건"
            value={draft.showWhen}
            targets={targets}
            disabled={lockExisting}
            onChange={(next) => set("showWhen", next)}
          />
          {lockExisting ? <p className="question-editor__hint">{LOCKED_CONDITION}</p> : null}
        </>
      ) : null}

      {message ? (
        <p className="registration-setup__alert" role="alert">
          {message}
        </p>
      ) : null}
      <div className="registration-setup__actions">
        <Button type="submit" variant="primary" size={40} loading={pending}>
          {isNew ? "질문 추가" : "저장"}
        </Button>
        <Button type="button" variant="tertiary" size={40} onClick={onCancel}>
          취소
        </Button>
      </div>
    </form>
  );
}

function TypeSettings({
  draft,
  idBase,
  set,
}: {
  draft: QuestionDraft;
  idBase: string;
  set: <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => void;
}) {
  const field = (key: keyof QuestionDraft, label: string, inputMode?: "numeric", type = "text") => (
    <div className="question-editor__row">
      <label htmlFor={`${idBase}-${key}`}>{label}</label>
      <input
        id={`${idBase}-${key}`}
        type={type}
        inputMode={inputMode}
        value={String(draft[key])}
        onChange={(change) => set(key, change.target.value as never)}
      />
    </div>
  );
  switch (draft.answerType) {
    case "SHORT_TEXT":
      return (
        <div className="question-editor__inline">
          <div className="question-editor__row">
            <label htmlFor={`${idBase}-format`}>입력 형식</label>
            <select
              id={`${idBase}-format`}
              value={draft.format}
              onChange={(change) => set("format", change.target.value as QuestionDraft["format"])}
            >
              <option value="NONE">제한 없음</option>
              <option value="PHONE">전화번호</option>
              <option value="DIGITS">숫자만</option>
            </select>
          </div>
          {field("maxLength", "최대 글자 수 (1–200)", "numeric")}
          {field("placeholder", "입력 예시")}
        </div>
      );
    case "LONG_TEXT":
      return (
        <div className="question-editor__inline">
          {field("maxLength", "최대 글자 수 (1–2000)", "numeric")}
          {field("placeholder", "입력 예시")}
        </div>
      );
    case "SINGLE_CHOICE":
      return (
        <div className="question-editor__inline">
          <div className="question-editor__row">
            <label htmlFor={`${idBase}-display`}>보여 주는 방식</label>
            <select
              id={`${idBase}-display`}
              value={draft.display}
              onChange={(change) => set("display", change.target.value as QuestionDraft["display"])}
            >
              <option value="LIST">목록</option>
              <option value="BUTTONS">버튼</option>
            </select>
          </div>
          <OtherToggle draft={draft} set={set} />
        </div>
      );
    case "MULTI_CHOICE":
      return (
        <div className="question-editor__inline">
          {field("minSelect", "최소 선택 수", "numeric")}
          {field("maxSelect", "최대 선택 수", "numeric")}
          <OtherToggle draft={draft} set={set} />
        </div>
      );
    case "DROPDOWN":
      return null;
    case "DATE":
    case "DATE_RANGE": {
      const type = draft.includeTime ? "datetime-local" : "date";
      return (
        <div className="question-editor__inline">
          <IncludeTime draft={draft} set={set} />
          {field("min", "고를 수 있는 처음", undefined, type)}
          {field("max", "고를 수 있는 끝", undefined, type)}
        </div>
      );
    }
    case "NUMBER":
      return (
        <div className="question-editor__inline">
          {field("min", "최솟값", "numeric")}
          {field("max", "최댓값", "numeric")}
          {field("unit", "단위 (예: 명)")}
        </div>
      );
    case "YES_NO":
      return (
        <div className="question-editor__inline">
          <div className="question-editor__row">
            <label htmlFor={`${idBase}-style`}>모양</label>
            <select
              id={`${idBase}-style`}
              value={draft.style}
              onChange={(change) => set("style", change.target.value as QuestionDraft["style"])}
            >
              <option value="YES_NO">예/아니오</option>
              <option value="CONSENT">동의 체크</option>
            </select>
          </div>
          {draft.style === "YES_NO" ? (
            <>
              {field("yesLabel", "'예' 문구")}
              {field("noLabel", "'아니오' 문구")}
            </>
          ) : (
            <p className="question-editor__hint">필수로 두면 체크해야 신청할 수 있어요.</p>
          )}
        </div>
      );
  }
}

function OtherToggle({
  draft,
  set,
}: {
  draft: QuestionDraft;
  set: <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => void;
}) {
  return (
    <label className="question-editor__check">
      <input type="checkbox" checked={draft.allowOther} onChange={(change) => set("allowOther", change.target.checked)} />
      기타(직접 입력) 받기
    </label>
  );
}

/** Converts the bounds when time is turned on or off. */
function IncludeTime({
  draft,
  set,
}: {
  draft: QuestionDraft;
  set: <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => void;
}) {
  return (
    <label className="question-editor__check">
      <input
        type="checkbox"
        checked={draft.includeTime}
        onChange={(change) => {
          const next = withIncludeTime(draft, change.target.checked);
          set("includeTime", next.includeTime);
          set("min", next.min);
          set("max", next.max);
        }}
      />
      시간도 받기
    </label>
  );
}
