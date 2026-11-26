import type { AnswerItem, ApplicationTable, TableColumn, TableRow } from "../../api/applications";
import type { FieldOption } from "../../api/forms";

/**
 * Typing into an answer cell of the 참가 현황 sheet (#509). The text is read back into the stored
 * shape of the question (DEC-068 §1), the same shapes the operator edit form sends, and the whole
 * application goes to the operator revise call (DEC-088 §2), which keeps consent and hidden answers.
 */

export type ParsedAnswer = { ok: true; value: Record<string, unknown> | null } | { ok: false; message: string };

/** Question columns a cell edit can change. Dates with a range and withheld phones go through 상세 > 수정. */
export function editableAnswer(column: TableColumn | undefined, table: ApplicationTable): boolean {
  if (!column) return false;
  if (column.answerType === "DATE_RANGE") return false;
  // The revise call needs the phone; without contact permission the table does not have it.
  return table.contactVisible;
}

function optionText(option: FieldOption): string {
  return option.group ? `${option.group} ${option.label}` : option.label;
}

function findOption(options: readonly FieldOption[], text: string): FieldOption | undefined {
  const wanted = text.trim().toLowerCase();
  return (
    options.find((option) => optionText(option).toLowerCase() === wanted) ??
    options.find((option) => option.label.toLowerCase() === wanted)
  );
}

/** The options an editor offers as a list (visible options only). */
export function answerChoices(column: TableColumn): string[] {
  if (column.answerType === "YES_NO") {
    const consent = column.config.style === "CONSENT";
    return [column.config.yesLabel || (consent ? "동의함" : "예"), column.config.noLabel || (consent ? "동의 안 함" : "아니오")];
  }
  return (column.config.options ?? []).filter((option) => !option.hidden).map(optionText);
}

export function parseAnswer(column: TableColumn, text: string): ParsedAnswer {
  const trimmed = text.trim();
  if (trimmed === "") {
    if (column.systemKey === "NAME" || column.systemKey === "PHONE") return { ok: false, message: `${column.label}은 비울 수 없어요.` };
    return { ok: true, value: null };
  }
  const options = column.config.options ?? [];
  switch (column.answerType) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return { ok: true, value: { text: column.answerType === "SHORT_TEXT" ? trimmed : text } };
    case "NUMBER": {
      const unit = column.config.unit;
      const bare = unit ? trimmed.replace(new RegExp(`\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") : trimmed;
      const n = Number(bare.replace(/,/g, ""));
      return Number.isFinite(n) ? { ok: true, value: { number: n } } : { ok: false, message: "숫자를 적어 주세요." };
    }
    case "SINGLE_CHOICE":
    case "DROPDOWN": {
      const option = findOption(options, trimmed);
      if (option) return { ok: true, value: { optionId: option.optionId } };
      const other = trimmed.replace(/^기타:\s*/, "");
      if (column.config.allowOther) return { ok: true, value: { other } };
      return { ok: false, message: `보기 중에서 골라 주세요: ${answerChoices(column).join(", ")}` };
    }
    case "MULTI_CHOICE": {
      const optionIds: string[] = [];
      let other: string | undefined;
      for (const part of trimmed.split(/\s*,\s*/).filter(Boolean)) {
        const option = findOption(options, part);
        if (option) {
          if (!optionIds.includes(option.optionId)) optionIds.push(option.optionId);
        } else if (column.config.allowOther) other = part.replace(/^기타:\s*/, "");
        else return { ok: false, message: `"${part}"는 보기에 없어요. 쉼표로 나눠 적어 주세요.` };
      }
      return { ok: true, value: other === undefined ? { optionIds } : { optionIds, other } };
    }
    case "YES_NO": {
      const [yes, no] = answerChoices(column);
      const lower = trimmed.toLowerCase();
      if ([yes.toLowerCase(), "예", "네", "y", "yes", "true", "o", "1", "동의함"].includes(lower)) return { ok: true, value: { value: true } };
      if ([no.toLowerCase(), "아니오", "아니요", "n", "no", "false", "x", "0", "동의 안 함"].includes(lower))
        return { ok: true, value: { value: false } };
      return { ok: false, message: `${yes} 또는 ${no}로 적어 주세요.` };
    }
    case "DATE": {
      const match = /^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(trimmed);
      if (!match) return { ok: false, message: "2027-01-22처럼 적어 주세요." };
      const [, y, m, d, hh, mm] = match;
      const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (column.config.includeTime) return { ok: true, value: { dateTime: `${date}T${(hh ?? "00").padStart(2, "0")}:${mm ?? "00"}` } };
      return { ok: true, value: { date } };
    }
    case "DATE_RANGE":
      return { ok: false, message: "기간 답은 상세에서 고쳐 주세요." };
  }
}

/** Every answer of the row with `changes` laid over it, in the revise call's shape. */
export function reviseItems(
  table: ApplicationTable,
  row: TableRow,
  changes: ReadonlyMap<string, Record<string, unknown> | null>,
): AnswerItem[] {
  const items: AnswerItem[] = [];
  for (const column of table.columns) {
    const value = changes.has(column.fieldId) ? changes.get(column.fieldId) : row.answers[column.fieldId];
    if (!value) continue;
    if ((column.answerType === "SHORT_TEXT" || column.answerType === "LONG_TEXT") && typeof value.text === "string") {
      items.push({ fieldId: column.fieldId, text: value.text });
    } else {
      items.push({ fieldId: column.fieldId, value });
    }
  }
  return items;
}
