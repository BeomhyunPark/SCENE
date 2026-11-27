import { useState, type FormEvent } from "react";
import type { FieldInput, FormField } from "../../api/forms";
import { Button } from "../Button";
import { FieldPrivacyWarning } from "../FieldPrivacyWarning";

/**
 * Rewords a base question (이름·전화·또래) or a generated question (DEC-070). The type, the
 * conditions, and the option set belong to the form setup, so only wording is offered here.
 */
export function WordingEditor({
  field,
  pending,
  serverError,
  onSave,
  onCancel,
}: {
  field: FormField;
  pending: boolean;
  serverError: string;
  onSave: (changes: Partial<FieldInput>) => void;
  onCancel: () => void;
}) {
  const system = field.kind === "SYSTEM";
  const text = field.answerType === "SHORT_TEXT" || field.answerType === "LONG_TEXT";
  const shownOptions = (field.config.options ?? []).filter((option) => !option.hidden);
  const [label, setLabel] = useState(field.label);
  const [description, setDescription] = useState(field.description ?? "");
  const [placeholder, setPlaceholder] = useState(field.config.placeholder ?? "");
  const [required, setRequired] = useState(field.required);
  const [optionLabels, setOptionLabels] = useState<Record<string, string>>(
    Object.fromEntries(shownOptions.map((option) => [option.optionId, option.label])),
  );
  // After the first save attempt the check runs live, so fixed wording clears its message at once (#526).
  const [checked, setChecked] = useState(false);

  function findProblem(): string {
    const trimmed = label.trim();
    if (trimmed.length < 1 || trimmed.length > 200) return "질문을 1–200자로 써 주세요.";
    if (description.trim().length > 500) return "설명은 500자까지 쓸 수 있어요.";
    if (placeholder.trim().length > 100) return "안내 문구는 100자까지 쓸 수 있어요.";
    if (Object.values(optionLabels).some((value) => value.trim().length < 1 || value.trim().length > 100)) {
      return "보기 문구를 1–100자로 써 주세요.";
    }
    return "";
  }
  const problem = checked ? findProblem() : "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecked(true);
    if (findProblem()) return;
    const trimmed = label.trim();
    const changes: Partial<FieldInput> = { label: trimmed, description: description.trim() || null };
    if (system) {
      changes.config = { placeholder: placeholder.trim() || null };
    } else {
      changes.required = required;
      // The whole config goes back with only the wording changed.
      changes.config = {
        ...field.config,
        ...(text ? { placeholder: placeholder.trim() || null } : {}),
        options: field.config.options?.map((option) => ({
          ...option,
          label: optionLabels[option.optionId]?.trim() ?? option.label,
        })),
      };
      if (!field.config.options) delete changes.config.options;
    }
    onSave(changes);
  }

  return (
    <form className="question-editor" noValidate onSubmit={submit} aria-label={`${field.label} 문구 수정`}>
      <p className="question-editor__hint">
        {system
          ? "기본 항목은 문구만 고칠 수 있어요. 받는 형식은 그대로예요."
          : "자동으로 만든 질문은 문구만 고칠 수 있어요. 유형·보기 구성·표시 조건은 위 신청서 설정을 따라요."}
      </p>
      <div className="question-editor__row">
        <label htmlFor="wording-label">질문</label>
        <input id="wording-label" value={label} onChange={(change) => setLabel(change.target.value)} />
        <FieldPrivacyWarning label={label} />
      </div>
      <div className="question-editor__row">
        <label htmlFor="wording-description">설명 (선택)</label>
        <input id="wording-description" value={description} onChange={(change) => setDescription(change.target.value)} />
        <FieldPrivacyWarning label={description} />
      </div>
      {text ? (
        <div className="question-editor__row">
          <label htmlFor="wording-placeholder">안내 문구 (선택)</label>
          <input id="wording-placeholder" value={placeholder} onChange={(change) => setPlaceholder(change.target.value)} />
        </div>
      ) : null}
      {shownOptions.length > 0 ? (
        <fieldset className="question-editor__options">
          <legend>보기 문구</legend>
          {shownOptions.map((option, index) => (
            <div key={option.optionId} className="question-editor__row">
              <input
                aria-label={`보기 ${index + 1} 문구${option.group ? ` (${option.group})` : ""}`}
                value={optionLabels[option.optionId] ?? ""}
                onChange={(change) => setOptionLabels((current) => ({ ...current, [option.optionId]: change.target.value }))}
              />
              {option.group ? <small>{option.group}</small> : null}
            </div>
          ))}
        </fieldset>
      ) : null}
      {system ? null : (
        <label className="question-editor__check">
          <input type="checkbox" checked={required} onChange={(change) => setRequired(change.target.checked)} />
          필수
        </label>
      )}
      {problem || serverError ? (
        <p className="registration-setup__alert" role="alert">
          {problem || serverError}
        </p>
      ) : null}
      <div className="registration-setup__actions">
        <Button type="submit" variant="primary" size={40} loading={pending}>
          문구 저장
        </Button>
        <Button type="button" variant="tertiary" size={40} onClick={onCancel}>
          취소
        </Button>
      </div>
    </form>
  );
}
