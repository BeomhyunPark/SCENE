import { useState } from "react";
import type { FormField } from "../../api/forms";
import { Button } from "../Button";
import { CompletionNotice } from "../CompletionNotice";
import { AnswerInput } from "../apply/AnswerInput";
import { RangeSummary } from "../apply/RangeSummary";
import { departureFieldId, rangeProblem } from "../apply/attendanceRange";
import { prune, visibleFields, type RawAnswer, type RawAnswers } from "../apply/answerModel";
import { optionView } from "../apply/optionView";
import "../ParticipantGate.css";

/**
 * The form as a participant sees it right now. Answers stay in this component and are never
 * sent, so the operator can click through each branch.
 */
export function FormPreview({ fields, completionNotice = null }: { fields: FormField[]; completionNotice?: string | null }) {
  // Same view the public form gets: hidden questions and hidden options are left out.
  const shownFields = fields
    .filter((field) => !field.hidden)
    .map((field) =>
      field.config.options
        ? { ...field, config: { ...field.config, options: field.config.options.filter((option) => !option.hidden) } }
        : field,
    );
  const [values, setValues] = useState<RawAnswers>({});
  const pruned = prune(shownFields, values);
  const shown = visibleFields(shownFields, pruned);
  const departureId = departureFieldId(shownFields);

  function change(fieldId: string, next: RawAnswer) {
    setValues((current) => prune(shownFields, { ...current, [fieldId]: next }));
  }

  return (
    <section className="registration-setup__panel form-preview" aria-labelledby="form-preview-title">
      <div className="registration-setup__heading">
        <h3 id="form-preview-title">참가자 화면 미리보기</h3>
        <Button type="button" variant="tertiary" size={32} onClick={() => setValues({})}>
          처음부터
        </Button>
      </div>
      {/* One line (#498): the count of waiting questions was a calculation, not something to act on. */}
      <p className="registration-setup__note">여기서 고른 답은 저장되지 않아요.</p>
      <div className="participant-gate__fields form-preview__fields">
        {shown.map((field) => (
          <AnswerInput
            key={field.fieldId}
            field={field}
            {...optionView(field, shownFields, pruned)}
            value={pruned[field.fieldId]}
            error={field.fieldId === departureId ? rangeProblem(shownFields, pruned) : null}
            onChange={(next) => change(field.fieldId, next)}
            extra={field.fieldId === departureId ? <RangeSummary fields={shownFields} values={pruned} /> : null}
          />
        ))}
      </div>
      <div className="form-preview__done">
        <h4>신청을 마친 화면</h4>
        {completionNotice?.trim() ? (
          <CompletionNotice text={completionNotice.replace(/\r\n?/g, "\n").trim()} />
        ) : (
          <p className="registration-setup__note">완료 안내를 쓰면 여기에 보여요.</p>
        )}
      </div>
    </section>
  );
}
