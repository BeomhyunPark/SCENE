import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { reviseApplicationAnswers, saveApplicationOperation, type ApplicationTable, type TableRow } from "../../api/applications";
import { ApiError } from "../../api/errors";
import { queryKeys } from "../../api/queryKeys";
import {
  applyOps,
  applyRosterSheetOps,
  cellKey,
  cleanFormat,
  EMPTY_SHEET,
  getRosterSheet,
  newSheetId,
  OPERATOR_COLUMN,
  OPERATOR_ROW,
  type CellFormat,
  type SheetDoc,
  type SheetOp,
  type SheetRule,
} from "../../api/rosterSheet";
import { answerChoices, editableAnswer, parseAnswer, reviseItems } from "./answerEdit";
import { MEMO, type ColumnDef } from "./model";
import { isOperatorColumn, toStored, type Workbook } from "./sheet";

/** One cell written by the reader: the row key, the column id and the typed text (A1 formulas). */
export type CellWrite = { rowKey: string; colId: string; text: string };
export type FormatWrite = { rowKey: string; colId: string; format: CellFormat | null };

type Action = { kind: "cells"; writes: CellWrite[] } | { kind: "formats"; writes: FormatWrite[] } | { kind: "ops"; ops: SheetOp[] };
type Entry = { forward: Action[]; backward: Action[] };

export type SheetEditor = ReturnType<typeof useRosterSheet>;

/**
 * Saving the 참가 현황 sheet (#509). Each cell goes where its value lives:
 * - operator columns and operator rows → the operator sheet (#508), shown at once and sent in order;
 * - question columns of a participant → the operator revise call (DEC-088 §2), one call per person;
 * - 운영 메모 → the operation memo (DEC-075).
 * Undo and redo replay the opposite writes through the same paths.
 */
export function useRosterSheet({
  eventId,
  table,
  mayWrite,
  findRow,
}: {
  eventId: string;
  table: ApplicationTable;
  /** Effective PARTICIPANT_WRITE on an event that is not archived. */
  mayWrite: boolean;
  findRow: (rowKey: string) => TableRow | undefined;
}) {
  const queryClient = useQueryClient();
  const sheet = useQuery({
    queryKey: queryKeys.rosterSheet(eventId),
    queryFn: ({ signal }) => getRosterSheet(eventId, signal),
    enabled: eventId.length > 0,
    // Other operators' cells show up without a reload.
    refetchInterval: 20_000,
  });
  const [pending, setPending] = useState<SheetOp[][]>([]);
  const [overlay, setOverlay] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(0);
  const [history, setHistory] = useState<{ undo: Entry[]; redo: Entry[] }>({ undo: [], redo: [] });
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  // Answers typed into the table show until the table is read again.
  const [overlayTable, setOverlayTable] = useState(table);
  if (overlayTable !== table) {
    setOverlayTable(table);
    if (overlay.size > 0) setOverlay(new Map());
  }

  const server = sheet.data ?? EMPTY_SHEET;
  const doc: SheetDoc = useMemo(() => {
    try {
      return applyOps(server.doc, pending.flat());
    } catch {
      return server.doc;
    }
  }, [server.doc, pending]);

  const enqueue = useCallback(
    (job: () => Promise<unknown>) => {
      setSaving((n) => n + 1);
      const run = chain.current.then(job).finally(() => setSaving((n) => n - 1));
      chain.current = run.catch(() => undefined);
      return run;
    },
    [],
  );

  const sendOps = useCallback(
    (ops: SheetOp[]) => {
      if (ops.length === 0) return;
      setPending((before) => [...before, ops]);
      void enqueue(async () => {
        try {
          const saved = await applyRosterSheetOps(eventId, ops);
          queryClient.setQueryData(queryKeys.rosterSheet(eventId), saved);
        } catch (error) {
          setNotice(sheetFailure(error));
          await queryClient.invalidateQueries({ queryKey: queryKeys.rosterSheet(eventId) });
        } finally {
          setPending((before) => before.filter((item) => item !== ops));
        }
      });
    },
    [enqueue, eventId, queryClient],
  );

  const refreshTable = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.applicationTable(eventId) });
    await queryClient.refetchQueries({ queryKey: queryKeys.applicationTable(eventId) });
  }, [eventId, queryClient]);

  const latestRow = useCallback(
    (rowKey: string): TableRow | undefined => {
      const latest = queryClient.getQueryData<ApplicationTable>(queryKeys.applicationTable(eventId));
      const id = rowKey.slice(2);
      return latest?.rows.find((row) => (row.participantId || row.applicationId) === id) ?? findRow(rowKey);
    },
    [eventId, findRow, queryClient],
  );

  /** Why the cell cannot be typed into, or null when it can. */
  const lockReason = useCallback(
    (rowKey: string, column: ColumnDef): string | null => {
      if (!mayWrite) return "운영 정보를 고칠 권한이 없어요.";
      if (rowKey.startsWith(OPERATOR_ROW) || isOperatorColumn(column.id)) return null;
      if (column.id === MEMO) return null;
      if (column.id === "person") {
        const name = table.columns.find((item) => item.systemKey === "NAME");
        return editableAnswer(name, table) ? null : "이름은 연락처 권한이 있어야 표에서 고칠 수 있어요.";
      }
      const question = table.columns.find((item) => item.fieldId === column.id);
      if (!question) return `${column.label} 열은 여기서 고칠 수 없어요.`;
      if (question.answerType === "DATE_RANGE") return "기간 답은 상세에서 고쳐 주세요.";
      if (!table.contactVisible) return "참가자 답은 연락처 권한이 있어야 표에서 고칠 수 있어요.";
      return null;
    },
    [mayWrite, table],
  );

  /** Writes cells and returns the writes that undo them. `book` reads the values before the change. */
  const write = useCallback(
    (writes: CellWrite[], book: Workbook): CellWrite[] => {
      const ops: SheetOp[] = [];
      const answers = new Map<string, Map<string, Record<string, unknown> | null>>();
      const memos: { rowKey: string; text: string }[] = [];
      const undo: CellWrite[] = [];
      const shown = new Map(overlay);
      const errors: string[] = [];
      for (const item of writes) {
        const before = book.raw(item.rowKey, item.colId);
        if (before === item.text) continue;
        if (item.rowKey.startsWith(OPERATOR_ROW) || isOperatorColumn(item.colId)) {
          ops.push({ op: "setCell", row: item.rowKey, col: item.colId, value: toStored(item.text, book.layout) || null });
          undo.push({ ...item, text: before });
          continue;
        }
        if (item.colId === MEMO) {
          memos.push({ rowKey: item.rowKey, text: item.text });
          shown.set(cellKey(item.rowKey, item.colId), item.text);
          undo.push({ ...item, text: before });
          continue;
        }
        const fieldId =
          item.colId === "person" ? table.columns.find((column) => column.systemKey === "NAME")?.fieldId : item.colId;
        const question = table.columns.find((column) => column.fieldId === fieldId);
        if (!question) continue;
        const parsed = parseAnswer(question, item.colId === "person" ? item.text.replace(/^\d{2}\s+/, "") : item.text);
        if (!parsed.ok) {
          errors.push(parsed.message);
          continue;
        }
        const row = answers.get(item.rowKey) ?? new Map();
        row.set(question.fieldId, parsed.value);
        answers.set(item.rowKey, row);
        shown.set(cellKey(item.rowKey, item.colId), item.text);
        undo.push({ ...item, text: before });
      }
      if (errors.length > 0) setNotice(errors[0]);
      sendOps(ops);
      if (memos.length > 0 || answers.size > 0) setOverlay(shown);
      for (const memo of memos) {
        void enqueue(async () => {
          const row = latestRow(memo.rowKey);
          if (!row) return;
          try {
            await saveApplicationOperation(eventId, row.applicationId, { memo: memo.text, expectedVersion: row.operation.version });
          } catch (error) {
            setNotice(error instanceof ApiError && error.code === "CONCURRENT_MODIFICATION" ? "다른 운영자가 먼저 메모를 고쳤어요. 다시 확인해 주세요." : "운영 메모를 저장하지 못했어요.");
          }
          await refreshTable();
        });
      }
      for (const [rowKey, changes] of answers) {
        void enqueue(async () => {
          const row = latestRow(rowKey);
          if (!row) return;
          try {
            await reviseApplicationAnswers(eventId, row.applicationId, {
              expectedRevision: row.revision,
              answers: reviseItems(table, row, changes),
            });
          } catch (error) {
            setNotice(answerFailure(error));
          }
          await refreshTable();
        });
      }
      return undo;
    },
    [enqueue, eventId, latestRow, overlay, refreshTable, sendOps, table],
  );

  const record = useCallback((entry: Entry) => {
    if (entry.forward.length === 0) return;
    setHistory((before) => ({ undo: [...before.undo.slice(-99), entry], redo: [] }));
  }, []);

  const commit = useCallback(
    (writes: CellWrite[], book: Workbook) => {
      setNotice("");
      const allowed = writes.filter((item) => {
        const column = { id: item.colId, label: item.colId } as ColumnDef;
        return lockReason(item.rowKey, column) === null;
      });
      const undo = write(allowed, book);
      if (undo.length > 0) {
        const done = allowed.filter((item) => undo.some((back) => back.rowKey === item.rowKey && back.colId === item.colId));
        record({ forward: [{ kind: "cells", writes: done }], backward: [{ kind: "cells", writes: undo }] });
      }
    },
    [lockReason, record, write],
  );

  const formatCells = useCallback(
    (cells: { rowKey: string; colId: string }[], patch: CellFormat | null) => {
      if (!mayWrite || cells.length === 0) return;
      const forward: FormatWrite[] = [];
      const backward: FormatWrite[] = [];
      for (const cell of cells) {
        const before = doc.cells[cellKey(cell.rowKey, cell.colId)]?.f ?? null;
        const after = patch === null ? null : cleanFormat({ ...before, ...patch });
        forward.push({ ...cell, format: after });
        backward.push({ ...cell, format: before });
      }
      sendOps(forward.map((item) => ({ op: "setCell", row: item.rowKey, col: item.colId, format: item.format })));
      record({ forward: [{ kind: "formats", writes: forward }], backward: [{ kind: "formats", writes: backward }] });
    },
    [doc.cells, mayWrite, record, sendOps],
  );

  const structural = useCallback(
    (forward: SheetOp[], backward: SheetOp[]) => {
      if (!mayWrite) return;
      sendOps(forward);
      record({ forward: [{ kind: "ops", ops: forward }], backward: [{ kind: "ops", ops: backward }] });
    },
    [mayWrite, record, sendOps],
  );

  const replay = useCallback(
    (actions: Action[], book: Workbook) => {
      for (const action of actions) {
        if (action.kind === "ops") sendOps(action.ops);
        else if (action.kind === "formats")
          sendOps(action.writes.map((item) => ({ op: "setCell", row: item.rowKey, col: item.colId, format: item.format })));
        else write(action.writes, book);
      }
    },
    [sendOps, write],
  );

  const undo = useCallback(
    (book: Workbook) => {
      const entry = history.undo[history.undo.length - 1];
      if (!entry) return;
      setHistory((before) => ({ undo: before.undo.slice(0, -1), redo: [...before.redo, entry] }));
      replay(entry.backward, book);
    },
    [history.undo, replay],
  );

  const redo = useCallback(
    (book: Workbook) => {
      const entry = history.redo[history.redo.length - 1];
      if (!entry) return;
      setHistory((before) => ({ undo: [...before.undo, entry], redo: before.redo.slice(0, -1) }));
      replay(entry.forward, book);
    },
    [history.redo, replay],
  );

  // --- columns and rows ---

  const addColumn = useCallback(
    (after: string | null, label = "새 열"): string => {
      const id = newSheetId();
      structural([{ op: "addColumn", id, label, after }], [{ op: "deleteColumn", id }]);
      return OPERATOR_COLUMN + id;
    },
    [structural],
  );

  const renameColumn = useCallback(
    (colId: string, label: string) => {
      const id = colId.slice(2);
      const before = doc.columns.find((column) => column.id === id);
      if (!before || !label.trim() || before.label === label.trim()) return;
      structural([{ op: "updateColumn", id, label: label.trim() }], [{ op: "updateColumn", id, label: before.label }]);
    },
    [doc.columns, structural],
  );

  const deleteColumn = useCallback(
    (colId: string) => {
      const id = colId.slice(2);
      const before = doc.columns.find((column) => column.id === id);
      if (!before) return;
      const restore: SheetOp[] = [{ op: "addColumn", id, label: before.label, after: before.after }];
      for (const [key, cell] of Object.entries(doc.cells)) {
        const [row, col] = key.split("|");
        if (col === colId) restore.push({ op: "setCell", row, col, value: cell.v ?? null, format: cell.f ?? null });
      }
      const rules = doc.rules.filter((rule) => rule.col === colId);
      if (rules.length > 0) restore.push({ op: "setRules", rules: doc.rules });
      structural([{ op: "deleteColumn", id }], restore);
    },
    [doc, structural],
  );

  const addRows = useCallback(
    (count: number, index: number | null = null) => {
      const ids = Array.from({ length: Math.max(1, Math.min(count, 500)) }, () => newSheetId());
      const at = index ?? doc.rows.length;
      structural(
        ids.map((id, i) => ({ op: "addRow", id, index: at + i })),
        ids.map((id) => ({ op: "deleteRow", id })),
      );
    },
    [doc.rows.length, structural],
  );

  const deleteRows = useCallback(
    (ids: string[]) => {
      const restore: SheetOp[] = [];
      for (const id of ids) {
        const index = doc.rows.findIndex((row) => row.id === id);
        if (index < 0) continue;
        restore.push({ op: "addRow", id, index });
        for (const [key, cell] of Object.entries(doc.cells)) {
          const [row, col] = key.split("|");
          if (row === OPERATOR_ROW + id) restore.push({ op: "setCell", row, col, value: cell.v ?? null, format: cell.f ?? null });
        }
      }
      if (restore.length === 0) return;
      structural(
        ids.map((id) => ({ op: "deleteRow", id })),
        // Rows come back in their old order: lowest index first.
        restore.sort((a, b) => (a.op === "addRow" && b.op === "addRow" ? (a.index ?? 0) - (b.index ?? 0) : a.op === "addRow" ? -1 : b.op === "addRow" ? 1 : 0)),
      );
    },
    [doc, structural],
  );

  /** The options an answer cell offers while it is typed into; null for free text. */
  const choicesFor = useCallback(
    (column: ColumnDef | undefined): string[] | null => {
      const question = column ? table.columns.find((item) => item.fieldId === column.id) : undefined;
      if (!question) return null;
      if (!["SINGLE_CHOICE", "DROPDOWN", "MULTI_CHOICE", "YES_NO"].includes(question.answerType)) return null;
      return answerChoices(question);
    },
    [table.columns],
  );

  const setRules = useCallback(
    (rules: SheetRule[]) => structural([{ op: "setRules", rules }], [{ op: "setRules", rules: doc.rules }]),
    [doc.rules, structural],
  );

  return {
    doc,
    loading: sheet.isPending,
    failed: sheet.isError,
    mayWrite,
    saving: saving > 0,
    notice,
    setNotice,
    overlay,
    lockReason,
    commit,
    formatCells,
    undo,
    redo,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    addColumn,
    renameColumn,
    deleteColumn,
    addRows,
    deleteRows,
    setRules,
    choicesFor,
  };
}

function sheetFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "FORBIDDEN") return "운영 시트를 고칠 권한이 없어요.";
    if (error.code === "EVENT_ARCHIVED") return "보관된 행사는 고칠 수 없어요.";
    if (error.code === "VALIDATION_FAILED") return "저장할 수 없는 값이 있어 되돌렸어요.";
  }
  return "운영 시트를 저장하지 못했어요. 잠시 뒤 다시 해 주세요.";
}

function answerFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "CONCURRENT_MODIFICATION") return "그사이 신청이 바뀌었어요. 새 내용을 확인하고 다시 고쳐 주세요.";
    if (error.code === "APPLICATION_VALIDATION_FAILED") return "신청서 규칙에 맞지 않는 답이라 저장하지 못했어요.";
    if (error.code === "FORBIDDEN") return "참가자 답을 고칠 권한이 없어요.";
  }
  return "참가자 답을 저장하지 못했어요.";
}
