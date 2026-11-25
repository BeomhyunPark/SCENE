import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import { listOperators } from "../api/operators";
import { queryKeys } from "../api/queryKeys";
import { createTask } from "../api/tasks";
import { Button } from "./Button";
import { taskFieldCopy } from "./taskCopy";
import "./OperationDrawer.css";
import "./TaskCreateDrawer.css";

/**
 * 새 업무 만들기 (#493, Figma P07-D02 264:26418): 오른쪽에서 열리는 520px 서랍, 휴대폰에선 화면 전체.
 * 서버가 받는 칸(업무명·담당자·시작일·마감일)만 둔다. Figma의 분류·설명·체크리스트·첨부파일은 서버에 없어 넣지 않았다.
 * 월 달력에서 날짜를 골라 열면(#475) 기간이 채워진 채로 열린다.
 */
export function TaskCreateDrawer({
  eventId,
  initial,
  onClose,
  onCreated,
}: {
  eventId: string;
  initial?: { startDate: string; dueDate: string };
  onClose: () => void;
  onCreated: () => Promise<unknown> | void;
}) {
  const titleId = useId();
  const nameId = useId();
  const assigneeId = useId();
  const startId = useId();
  const dueId = useId();
  const errorId = useId();
  const operators = useQuery({ queryKey: queryKeys.operators(eventId), queryFn: () => listOperators(eventId) });
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);

  // 포커스는 업무명 칸으로 들어오고, Tab은 서랍 안에서 돌고, Esc로 닫히며, 닫으면 연 버튼으로 돌아간다.
  const panel = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(false);
  useLayoutEffect(() => {
    closeRef.current = onClose;
    pendingRef.current = pending;
  });
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nameInput.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (!panel.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...panel.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = active === panel.current || !panel.current.contains(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
  }, []);

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    const trimmed = title.trim();
    setFieldError("");
    setFormError("");
    if (!trimmed) {
      setFieldError("업무 제목을 입력해 주세요.");
      nameInput.current?.focus();
      return;
    }
    setPending(true);
    try {
      await createTask(eventId, {
        title: trimmed,
        assigneeUserId: assignee ? assignee : undefined,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
      await onCreated();
      onClose();
    } catch (caught) {
      if (isApiError(caught, "VALIDATION_FAILED")) {
        const field = caught.errors?.[0]?.field ?? "";
        setFieldError(taskFieldCopy[field] ?? "제목을 확인해 주세요.");
        return;
      }
      setFormError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="operation-drawer" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <div ref={panel} className="operation-drawer__panel task-create" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="task-create__head">
          <h2 id={titleId} className="task-create__title">
            새 업무 만들기
          </h2>
          <button type="button" className="task-create__close scene-press scene-press--quiet" aria-label="닫기" disabled={pending} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <form className="task-create__form" noValidate={false} onSubmit={(form) => void submit(form)}>
          <div className="task-create__body">
            <div className="task-create__field">
              <label htmlFor={nameId}>업무명</label>
              <input
                id={nameId}
                ref={nameInput}
                value={title}
                placeholder="예: 차량별 최종 탑승 인원 확인"
                aria-invalid={fieldError.length > 0}
                aria-describedby={fieldError ? errorId : undefined}
                onChange={(change) => setTitle(change.target.value)}
              />
            </div>
            <div className="task-create__field">
              <label htmlFor={assigneeId}>담당자</label>
              <select id={assigneeId} value={assignee} onChange={(change) => setAssignee(change.target.value)}>
                <option value="">담당 없음</option>
                {operators.data?.items.map((operator) => (
                  <option key={operator.userId} value={operator.userId}>
                    {operator.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="task-create__pair">
              <div className="task-create__field">
                <label htmlFor={startId}>시작일</label>
                <input id={startId} type="date" value={startDate} max={dueDate || undefined} onChange={(change) => setStartDate(change.target.value)} />
              </div>
              <div className="task-create__field">
                <label htmlFor={dueId}>마감일</label>
                <input id={dueId} type="date" value={dueDate} min={startDate || undefined} onChange={(change) => setDueDate(change.target.value)} />
              </div>
            </div>
            {fieldError ? (
              <p id={errorId} className="task-create__error" role="alert">
                {fieldError}
              </p>
            ) : null}
            {formError ? (
              <p className="task-create__error" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
          <footer className="operation-drawer__foot">
            <Button type="button" variant="secondary" size={40} disabled={pending} onClick={onClose}>
              취소
            </Button>
            <Button type="submit" variant="primary" size={40} loading={pending}>
              업무 만들기
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
