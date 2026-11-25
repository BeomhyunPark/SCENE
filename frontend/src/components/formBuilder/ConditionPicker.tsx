import type { FormField, ShowWhen } from "../../api/forms";
import { conditionSummary } from "./questionDraft";
import { Select } from "../Select";

/**
 * "Show this when …". Targets are earlier choice or yes/no questions (DEC-068). The server
 * checks the same rule; this only offers what it would accept.
 */
export function ConditionPicker({
  id,
  label,
  value,
  targets,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: ShowWhen | null;
  targets: FormField[];
  disabled?: boolean;
  onChange: (next: ShowWhen | null) => void;
}) {
  if (value && "anyOf" in value) {
    // The server makes `anyOf` on generated options only (#324). The editor cannot build one, so it
    // shows the condition in words and keeps it as it is.
    return (
      <fieldset className="question-editor__condition" disabled>
        <legend>{label}</legend>
        <p className="question-editor__hint">{conditionSummary(value, targets)} 보여요. 이 조건은 여기서 바꿀 수 없어요.</p>
      </fieldset>
    );
  }
  const target = value ? targets.find((field) => field.fieldId === value.fieldId) : undefined;

  function pickTarget(fieldId: string) {
    if (!fieldId) return onChange(null);
    const next = targets.find((field) => field.fieldId === fieldId);
    if (!next) return onChange(null);
    if (next.answerType === "YES_NO") return onChange({ fieldId, equals: true });
    return onChange({ fieldId, optionIds: [] });
  }

  return (
    <fieldset className="question-editor__condition" disabled={disabled}>
      <legend>{label}</legend>
      <label htmlFor={`${id}-target`} className="question-editor__sub">
        조건 질문
      </label>
      <Select
        id={`${id}-target`}
        value={value?.fieldId ?? ""}
        disabled={disabled}
        options={[{ value: "", label: "항상 보이기" }, ...targets.map((field) => ({ value: field.fieldId, label: field.label }))]}
        onChange={pickTarget}
      />
      {value && target && "equals" in value ? (
        <div className="question-editor__inline" role="radiogroup" aria-label="조건 답">
          {[true, false].map((answer) => (
            <label key={String(answer)}>
              <input
                type="radio"
                name={`${id}-equals`}
                checked={value.equals === answer}
                onChange={() => onChange({ fieldId: value.fieldId, equals: answer })}
              />
              {answer ? "예" : "아니오"}일 때
            </label>
          ))}
        </div>
      ) : null}
      {value && target && "optionIds" in value ? (
        <div className="question-editor__inline" role="group" aria-label="조건 보기">
          {(target.config.options ?? []).map((option) => (
            <label key={option.optionId}>
              <input
                type="checkbox"
                checked={value.optionIds.includes(option.optionId)}
                onChange={(change) =>
                  onChange({
                    fieldId: value.fieldId,
                    optionIds: change.target.checked
                      ? [...value.optionIds, option.optionId]
                      : value.optionIds.filter((item) => item !== option.optionId),
                  })
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
