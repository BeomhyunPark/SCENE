import type { FieldOption, FormField } from "../../api/forms";
import type { ReactNode } from "react";
import type { RawAnswer } from "./answerModel";
import { groupedByDay, isRangeField } from "./attendanceRange";
import { Select } from "../Select";

/**
 * One question on the public form. `options` are the options shown right now (hidden and
 * conditional ones already removed). Labels come from the operator's text.
 */
export function AnswerInput({
  field,
  options,
  value,
  error,
  onChange,
  extra,
  notice = null,
}: {
  field: FormField;
  options: FieldOption[];
  /** Why some choices are not offered right now (#324, #328). */
  notice?: string | null;
  value: RawAnswer | undefined;
  error: string | null;
  onChange: (next: RawAnswer) => void;
  /** Shown under the choices, above the error (the range summary under 출발). */
  extra?: ReactNode;
}) {
  const id = `field-${field.fieldId}`;
  const describedBy = [field.description ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  const answer = value ?? {};
  const config = field.config;
  const common = {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
    "aria-required": field.required || undefined,
  };
  const heading = (
    <>
      {field.label}
      {field.required ? <span className="participant-gate__required"> (필수)</span> : null}
    </>
  );
  const help = field.description ? (
    <p id={`${id}-description`} className="participant-gate__help">
      {field.description}
    </p>
  ) : null;
  const errorLine = error ? (
    <p id={`${id}-error`} className="participant-gate__error">
      {error}
    </p>
  ) : null;

  if (field.answerType === "YES_NO" && config.style === "CONSENT") {
    return (
      <div className="participant-gate__field">
        <label className="participant-gate__choice">
          <input
            type="checkbox"
            checked={answer.bool === true}
            onChange={(change) => onChange({ bool: change.target.checked })}
            {...common}
          />
          <span>{heading}</span>
        </label>
        {help}
        {errorLine}
      </div>
    );
  }

  const grouped = field.answerType === "SINGLE_CHOICE" || field.answerType === "MULTI_CHOICE" || field.answerType === "YES_NO";
  if (grouped) {
    return (
      <fieldset className="participant-gate__field participant-gate__group" {...common}>
        <legend className="participant-gate__label">{heading}</legend>
        {help}
        {isRangeField(field) ? (
          // Arrival and departure (DEC-074): one row of slot chips per day, so the order reads at a glance.
          <ChoiceList
            field={{ ...field, config: { ...config, display: "BUTTONS" } }}
            options={groupedByDay(options)}
            answer={answer}
            onChange={onChange}
            fullLabel={(option) => (option.group ? `${option.group} ${option.label}` : undefined)}
          />
        ) : (
          <ChoiceList field={field} options={options} answer={answer} onChange={onChange} />
        )}
        {notice ? (
          <p className="participant-gate__notice">{notice}</p>
        ) : null}
        {extra}
        {errorLine}
      </fieldset>
    );
  }

  return (
    <div className="participant-gate__field">
      <label className="participant-gate__label" htmlFor={id}>
        {heading}
      </label>
      {help}
      {field.answerType === "LONG_TEXT" ? (
        <textarea
          id={id}
          className="participant-gate__input participant-gate__textarea"
          value={answer.text ?? ""}
          maxLength={config.maxLength}
          placeholder={config.placeholder ?? undefined}
          onChange={(change) => onChange({ text: change.target.value })}
          {...common}
        />
      ) : null}
      {field.answerType === "SHORT_TEXT" ? (
        <input
          id={id}
          className="participant-gate__input"
          type={config.format === "PHONE" ? "tel" : "text"}
          inputMode={config.format === "DIGITS" || config.format === "PHONE" ? "numeric" : undefined}
          autoComplete={field.systemKey === "PHONE" ? "tel" : field.systemKey === "NAME" ? "name" : "off"}
          value={answer.text ?? ""}
          placeholder={config.placeholder ?? undefined}
          onChange={(change) => onChange({ text: change.target.value })}
          {...common}
        />
      ) : null}
      {field.answerType === "DROPDOWN" ? (
        <Select
          id={id}
          className="participant-gate__input"
          value={answer.optionId ?? ""}
          options={[
            { value: "", label: "골라 주세요" },
            ...options.map((option) => ({
              value: option.optionId,
              label: option.group ? `${option.group} · ${option.label}` : option.label,
            })),
          ]}
          onChange={(value) => onChange({ optionId: value || undefined })}
          {...common}
        />
      ) : null}
      {field.answerType === "DATE" ? (
        <input
          id={id}
          className="participant-gate__input"
          type={config.includeTime ? "datetime-local" : "date"}
          min={config.min == null ? undefined : String(config.min)}
          max={config.max == null ? undefined : String(config.max)}
          value={answer.date ?? ""}
          onChange={(change) => onChange({ date: change.target.value })}
          {...common}
        />
      ) : null}
      {field.answerType === "DATE_RANGE" ? (
        <div className="participant-gate__range">
          {(["start", "end"] as const).map((key) => (
            <label key={key} className="participant-gate__sublabel">
              {key === "start" ? "시작" : "끝"}
              <input
                id={key === "start" ? id : undefined}
                className="participant-gate__input"
                type={config.includeTime ? "datetime-local" : "date"}
                min={config.min == null ? undefined : String(config.min)}
                max={config.max == null ? undefined : String(config.max)}
                value={answer[key] ?? ""}
                onChange={(change) => onChange({ ...answer, [key]: change.target.value })}
                {...common}
              />
            </label>
          ))}
        </div>
      ) : null}
      {field.answerType === "NUMBER" ? (
        <div className="participant-gate__range">
          <input
            id={id}
            className="participant-gate__input participant-gate__number"
            type="text"
            inputMode="numeric"
            value={answer.number ?? ""}
            onChange={(change) => onChange({ number: change.target.value })}
            {...common}
          />
          {config.unit ? <span className="participant-gate__body">{config.unit}</span> : null}
        </div>
      ) : null}
      {errorLine}
    </div>
  );
}

/** Radios or checkboxes, with options grouped under their `group` (for example a date). */
function ChoiceList({
  field,
  options,
  answer,
  onChange,
  fullLabel,
}: {
  field: FormField;
  options: FieldOption[];
  answer: RawAnswer;
  onChange: (next: RawAnswer) => void;
  /** An accessible name when the visible label leans on its group heading. */
  fullLabel?: (option: FieldOption) => string | undefined;
}) {
  const name = `field-${field.fieldId}`;
  const multi = field.answerType === "MULTI_CHOICE";
  const buttons = field.config.display === "BUTTONS" || field.answerType === "YES_NO";
  const className = buttons ? "participant-gate__choices participant-gate__choices--buttons" : "participant-gate__choices";

  if (field.answerType === "YES_NO") {
    return (
      <div className={className}>
        {[true, false].map((choice) => (
          <label key={String(choice)} className="participant-gate__choice">
            <input type="radio" name={name} checked={answer.bool === choice} onChange={() => onChange({ bool: choice })} />
            <span>{choice ? (field.config.yesLabel ?? "예") : (field.config.noLabel ?? "아니오")}</span>
          </label>
        ))}
      </div>
    );
  }

  const groups: { group: string | null; options: FieldOption[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.group === option.group) last.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  const chosen = new Set(answer.optionIds ?? []);

  return (
    <>
      {groups.map((block, index) => (
        <div key={`${block.group ?? ""}-${index}`} className="participant-gate__choice-group">
          {block.group ? <p className="participant-gate__sublabel">{block.group}</p> : null}
          <div className={className}>
            {block.options.map((option) => (
              <label key={option.optionId} className="participant-gate__choice">
                {multi ? (
                  <input
                    type="checkbox"
                    checked={chosen.has(option.optionId)}
                    onChange={(change) => {
                      const next = new Set(chosen);
                      if (change.target.checked) next.add(option.optionId);
                      else next.delete(option.optionId);
                      onChange({ ...answer, optionIds: [...next] });
                    }}
                  />
                ) : (
                  <input
                    type="radio"
                    name={name}
                    checked={!answer.otherOn && answer.optionId === option.optionId}
                    aria-label={fullLabel?.(option)}
                    onChange={() => onChange({ optionId: option.optionId })}
                  />
                )}
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {field.config.allowOther ? (
        <div className="participant-gate__other">
          <label className="participant-gate__choice">
            <input
              type={multi ? "checkbox" : "radio"}
              name={multi ? undefined : name}
              checked={answer.otherOn === true}
              onChange={(change) =>
                onChange(multi ? { ...answer, otherOn: change.target.checked } : { otherOn: true, other: answer.other })
              }
            />
            <span>기타</span>
          </label>
          {answer.otherOn ? (
            <input
              className="participant-gate__input"
              aria-label={`${field.label} 기타 내용`}
              value={answer.other ?? ""}
              onChange={(change) => onChange({ ...answer, other: change.target.value })}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
