import type { ReactNode } from "react";
import type { AnswerItem } from "../api/applications";
import type { FormField } from "../api/forms";
import { AnswerInput } from "./apply/AnswerInput";
import { toAnswerItems, type RawAnswers } from "./apply/answerModel";
import { useAnswerDraft } from "./apply/useAnswerDraft";
import { Button } from "./Button";
import "./ParticipantGate.css";
import "./OperatorAnswerForm.css";

export type AnswerDraft = ReturnType<typeof useAnswerDraft>;

/**
 * The answer form of 신청 고치기 and 참가자 직접 추가. Same inputs, conditions and 도착·출발 rule as the
 * participant's form (`useAnswerDraft`); `fields` are already `operatorFields`.
 */
export function OperatorAnswerForm({
  fields,
  initial,
  lead,
  after,
  submitLabel,
  pending,
  failure,
  fieldErrors,
  onSubmit,
  cancel,
}: {
  fields: FormField[];
  initial: RawAnswers;
  lead: ReactNode;
  /** A note that belongs after the questions (the consent question the operator does not answer). */
  after?: ReactNode;
  submitLabel: string;
  pending: boolean;
  failure: ReactNode;
  fieldErrors: Map<string, string>;
  onSubmit: (answers: AnswerItem[], draft: AnswerDraft) => void;
  cancel: ReactNode;
}) {
  const draft = useAnswerDraft(fields, initial);
  return (
    <form
      className="operator-answers participant-gate__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (draft.firstProblem) {
          draft.setShowAll(true);
          document.getElementById(`field-${draft.firstProblem.fieldId}`)?.focus();
          return;
        }
        onSubmit(toAnswerItems(fields, draft.values), draft);
      }}
    >
      <div className="operator-answers__lead">{lead}</div>
      <div className="participant-gate__fields">
        {draft.shown.map((field) => (
          <AnswerInput
            key={field.fieldId}
            {...draft.inputProps(field)}
            error={draft.inputProps(field).error ?? fieldErrors.get(field.fieldId) ?? null}
          />
        ))}
      </div>
      {after ? <div className="operator-answers__lead">{after}</div> : null}
      {draft.showAll && draft.firstProblem ? (
        <p className="participant-gate__error">확인이 필요한 질문이 있어요.</p>
      ) : null}
      {failure ? (
        <div className="participant-gate__error" role="alert">
          {failure}
        </div>
      ) : null}
      <div className="operator-answers__actions">
        <Button type="submit" variant="primary" size={40} loading={pending}>
          {submitLabel}
        </Button>
        {cancel}
      </div>
    </form>
  );
}
