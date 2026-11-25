import type { ApplicationAnswer, ApplicationDetail, RevisionChange } from "../api/applications";
import { formatAnswer } from "./answerDisplay";

export const NO_ANSWER = "응답 없음";

/** One changed question with its answer before and after, as the operator may see them (#437). */
export type DiffLine = { fieldId: string; label: string; before: string; after: string };

/**
 * Before and after of the questions a revision changed (DEC-078 §4 `changes`), from the details of
 * that revision and the one before it. Values go through `formatAnswer`, so a phone answer the
 * reader may not see stays withheld on both sides (#332). A question missing on one side reads
 * "응답 없음". The label is the one stored with the change.
 */
export function revisionDiff(changes: RevisionChange[], before: ApplicationDetail | undefined, after: ApplicationDetail | undefined): DiffLine[] {
  const text = (detail: ApplicationDetail | undefined, fieldId: string) => {
    const answer: ApplicationAnswer | undefined = detail?.answers.find((item) => item.fieldId === fieldId);
    return answer ? formatAnswer(answer) : NO_ANSWER;
  };
  return changes.map((change) => ({
    fieldId: change.fieldId,
    label: change.label,
    before: text(before, change.fieldId),
    after: text(after, change.fieldId),
  }));
}

/**
 * "참가자가 고침" / "운영자 김OO가 고침" / "운영자 김OO가 추가" / "처음 신청". A first revision by an
 * operator is a participant the operator added (DEC-088 §3).
 */
export function revisedByLabel(
  revisedBy: "PARTICIPANT" | "OPERATOR" | null,
  revision = 2,
  displayName: string | null = null,
): string {
  if (revisedBy === "PARTICIPANT") return "참가자가 고침";
  const who = displayName ? `운영자 ${displayName}` : "운영자";
  if (revisedBy === "OPERATOR") return revision === 1 ? `${who}가 추가` : `${who}가 고침`;
  return "처음 신청";
}
