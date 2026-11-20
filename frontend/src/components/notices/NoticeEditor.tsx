import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { isApiError } from "../../api/errors";
import type { EventDetail } from "../../api/events";
import {
  conflictEditor,
  createNotice,
  getNotice,
  listNotices,
  NOTICE_BODY_MAX,
  NOTICE_PIN_LIMIT,
  NOTICE_TITLE_MAX,
  noticeCommand,
  patchNotice,
  pinLimitIds,
  type NoticeAudienceType,
  type NoticeInput,
  type OperatorNotice,
} from "../../api/notices";
import { reloadQuery } from "../../api/queryClient";
import { queryKeys } from "../../api/queryKeys";
import { Button } from "../Button";
import { EventScreen } from "../EventScreen";
import { NoticeShell } from "./EventNotices";
import { AUDIENCE_HINT, AUDIENCE_LABEL, noticesHref } from "./noticeCopy";
import { useNoticeAccess } from "./noticeAccess";
import "./Notices.css";

const EMPTY: NoticeInput = { title: "", body: "", important: false, pinned: false, audience: "ALL" };
const AUDIENCES: NoticeAudienceType[] = ["ALL", "LEADERS", "STAFF"];

/** State a write leaves for the detail screen: "N명에게 알렸어요". */
export type NoticeFlash = { notified?: number; saved?: "draft" | "edited" };

export function NoticeEditor() {
  const { eventId = "", noticeId } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <EditorBody key={noticeId ?? "new"} event={event} spaceName={spaceName} noticeId={noticeId} />}
    </EventScreen>
  );
}

function EditorBody({ event, spaceName, noticeId }: { event: EventDetail; spaceName?: string; noticeId?: string }) {
  const eventId = event.eventId;
  const access = useNoticeAccess(event);
  const stored = useQuery({
    queryKey: queryKeys.notice(eventId, noticeId ?? ""),
    queryFn: ({ signal }) => getNotice(eventId, noticeId!, signal),
    enabled: Boolean(noticeId),
  });
  const back = noticeId ? noticesHref(eventId, noticeId) : noticesHref(eventId);
  const title = noticeId ? "공지 고치기" : "공지 쓰기";

  let content;
  if (noticeId && stored.isPending) content = <p className="notices__support">불러오는 중이에요.</p>;
  else if (noticeId && isApiError(stored.error, "RESOURCE_NOT_FOUND")) content = <Missing eventId={eventId} />;
  else if (noticeId && (stored.isError || !stored.data)) {
    content = (
      <div className="notices__retry">
        <p className="notices__support">불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(stored)}>
          다시 시도
        </Button>
      </div>
    );
  } else if (!access.pending && !access.canWrite) {
    content = <p className="notices__note">{access.readOnlyNote}</p>;
  } else if (stored.data?.status === "ARCHIVED") {
    content = <p className="notices__note">보관한 공지는 고칠 수 없어요. 보관을 해제한 뒤 고쳐 주세요.</p>;
  } else {
    content = <NoticeForm event={event} notice={stored.data ?? null} />;
  }

  return (
    <NoticeShell event={event} spaceName={spaceName} title={title} back={back} backLabel={noticeId ? "공지로" : "공지 목록"}>
      <div className="notices">{content}</div>
    </NoticeShell>
  );
}

function Missing({ eventId }: { eventId: string }) {
  return (
    <div className="notices__retry">
      <p className="notices__support">공지를 찾을 수 없어요. 지워졌을 수 있어요.</p>
      <Link className="notices__link" to={noticesHref(eventId)}>
        공지 목록으로
      </Link>
    </div>
  );
}

type Failure =
  | { kind: "conflict"; editor: string | null; mine: { title: string; body: string } }
  | { kind: "pin"; ids: string[] }
  | { kind: "field"; field: string }
  | { kind: "forbidden" }
  | { kind: "archived" }
  | { kind: "state" }
  | { kind: "retry" };

function NoticeForm({ event, notice }: { event: EventDetail; notice: OperatorNotice | null }) {
  const eventId = event.eventId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initial: NoticeInput = notice
    ? { title: notice.title, body: notice.body, important: notice.important, pinned: notice.pinned, audience: notice.audience }
    : EMPTY;
  const [value, setValue] = useState<NoticeInput>(initial);
  const [notify, setNotify] = useState(false);
  const [pending, setPending] = useState<"publish" | "save" | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [missing, setMissing] = useState<"title" | "body" | null>(null);
  // Pinned count for the 고정 switch (pinnedCount is the whole event's, whatever the filter).
  const published = useQuery({
    queryKey: queryKeys.noticeList(eventId, "PUBLISHED-head"),
    queryFn: ({ signal }) => listNotices(eventId, { status: ["PUBLISHED"], limit: 10 }, signal),
  });
  const pinnedCount = published.data?.pinnedCount ?? 0;
  const isPublished = notice?.status === "PUBLISHED";
  const countsTowardPin = !(isPublished && notice?.pinned);
  const pinFull = pinnedCount >= NOTICE_PIN_LIMIT && countsTowardPin && !value.pinned;
  const contentChanged =
    notice !== null &&
    (value.title.trim() !== notice.title ||
      value.body.trim() !== notice.body ||
      value.important !== notice.important ||
      value.audience !== notice.audience);

  const set = <K extends keyof NoticeInput>(key: K, next: NoticeInput[K]) => {
    setValue((current) => ({ ...current, [key]: next }));
    if (key === "title" || key === "body") setMissing(null);
  };

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notices(eventId) });
  }

  function onError(error: unknown) {
    if (isApiError(error, "CONCURRENT_MODIFICATION")) {
      setFailure({ kind: "conflict", editor: conflictEditor(error), mine: { title: value.title, body: value.body } });
      invalidate();
      // The 409 body is a summary without title or body: read the notice again and show it (#434 Follow-up 4).
      if (notice) {
        void queryClient
          .fetchQuery({ queryKey: queryKeys.notice(eventId, notice.noticeId), queryFn: () => getNotice(eventId, notice.noticeId) })
          .then((latest) => {
            setValue({ title: latest.title, body: latest.body, important: latest.important, pinned: latest.pinned, audience: latest.audience });
            setNotify(false);
          })
          .catch(() => setFailure({ kind: "state" }));
      }
      return;
    }
    const ids = pinLimitIds(error);
    if (ids) {
      setFailure({ kind: "pin", ids });
      void reloadQuery(published);
      return;
    }
    if (isApiError(error, "VALIDATION_FAILED")) setFailure({ kind: "field", field: error.errors?.[0]?.field ?? "" });
    else if (isApiError(error, "FORBIDDEN")) setFailure({ kind: "forbidden" });
    else if (isApiError(error, "EVENT_ARCHIVED")) setFailure({ kind: "archived" });
    else if (isApiError(error, "INVALID_STATE_TRANSITION", "RESOURCE_NOT_FOUND")) setFailure({ kind: "state" });
    else setFailure({ kind: "retry" });
  }

  async function submit(mode: "publish" | "save") {
    const title = value.title.trim();
    const body = value.body.trim();
    if (!title) return setMissing("title");
    if (!body) return setMissing("body");
    setFailure(null);
    setPending(mode);
    const input = { ...value, title, body };
    try {
      if (!notice) {
        const result = await createNotice(eventId, { ...input, publish: mode === "publish" });
        finish(result.notice, mode === "publish" ? { notified: result.notifiedCount } : { saved: "draft" });
        return;
      }
      const patch = changedKeys(notice, input);
      let current = notice;
      let notifiedCount = 0;
      if (Object.keys(patch).length > 0) {
        const result = await patchNotice(eventId, notice.noticeId, {
          ...patch,
          expectedVersion: notice.version,
          notify: isPublished && contentChanged && notify,
        });
        current = result.notice;
        notifiedCount = result.notifiedCount;
      }
      if (mode === "publish" && current.status === "DRAFT") {
        const result = await noticeCommand(eventId, current.noticeId, "publish", current.version);
        finish(result.notice, { notified: result.notifiedCount });
        return;
      }
      finish(current, isPublished && notify && contentChanged ? { saved: "edited", notified: notifiedCount } : { saved: "edited" });
    } catch (error) {
      onError(error);
    } finally {
      setPending(null);
    }
  }

  function finish(saved: OperatorNotice, flash: NoticeFlash) {
    queryClient.setQueryData(queryKeys.notice(eventId, saved.noticeId), saved);
    invalidate();
    navigate(noticesHref(eventId, saved.noticeId), { replace: true, state: flash });
  }

  function onSubmit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    void submit(notice && notice.status !== "DRAFT" ? "save" : "publish");
  }

  const pinnedTitles = failure?.kind === "pin" ? (published.data?.items ?? []).filter((item) => failure.ids.includes(item.noticeId)) : [];

  return (
    <form className="notice-form" onSubmit={onSubmit} noValidate>
      {failure?.kind === "conflict" ? (
        <div className="notice-form__alert" role="alert">
          <p>
            {failure.editor ? `${failure.editor}님이` : "다른 운영자가"} 먼저 고쳤어요. 지금 내용을 다시 불러왔어요. 확인하고 다시
            고쳐 주세요.
          </p>
          <details className="notice-form__mine">
            <summary>내가 쓴 내용 보기</summary>
            <p className="notice-text">{failure.mine.title}</p>
            <p className="notice-text">{failure.mine.body}</p>
          </details>
        </div>
      ) : null}
      <div className="notice-form__field">
        <label htmlFor="notice-title">제목</label>
        <input
          id="notice-title"
          value={value.title}
          maxLength={NOTICE_TITLE_MAX}
          autoComplete="off"
          aria-invalid={missing === "title"}
          aria-describedby={missing === "title" ? "notice-title-error" : undefined}
          onChange={(change) => set("title", change.target.value)}
        />
        {missing === "title" ? (
          <p id="notice-title-error" className="notice-form__error">
            제목을 적어 주세요.
          </p>
        ) : null}
      </div>
      <div className="notice-form__field">
        <label htmlFor="notice-body">내용</label>
        <textarea
          id="notice-body"
          value={value.body}
          maxLength={NOTICE_BODY_MAX}
          rows={7}
          aria-invalid={missing === "body"}
          aria-describedby="notice-body-count"
          onChange={(change) => set("body", change.target.value)}
        />
        <p id="notice-body-count" className="notice-form__hint">
          {missing === "body" ? <span className="notice-form__error">내용을 적어 주세요. </span> : null}
          {value.body.length.toLocaleString("ko-KR")} / {NOTICE_BODY_MAX.toLocaleString("ko-KR")}자 · 링크는 https://로 적어 주세요
        </p>
      </div>
      <fieldset className="notice-form__field notice-form__audience">
        <legend>누가 볼까요</legend>
        <div className="notices__filters">
          {AUDIENCES.map((audience) => (
            <label key={audience} className="notice-form__choice">
              <input
                type="radio"
                name="notice-audience"
                value={audience}
                checked={value.audience === audience}
                onChange={() => set("audience", audience)}
              />
              <span>{AUDIENCE_LABEL[audience]}</span>
            </label>
          ))}
        </div>
        <p className="notice-form__hint">{AUDIENCE_HINT[value.audience]}</p>
      </fieldset>
      <label className="notice-form__toggle">
        <input type="checkbox" checked={value.important} onChange={(change) => set("important", change.target.checked)} />
        <span>
          <strong>중요</strong>
          <span className="notice-form__hint">목록에서 눈에 띄게 보이고 알림도 중요로 가요.</span>
        </span>
      </label>
      <label className="notice-form__toggle">
        <input
          type="checkbox"
          checked={value.pinned}
          disabled={pinFull}
          onChange={(change) => set("pinned", change.target.checked)}
        />
        <span>
          <strong>고정</strong>
          <span className="notice-form__hint">
            {pinFull ? "고정은 3개까지예요. 다른 고정을 풀면 고정할 수 있어요." : "참가자 공지 맨 위에 둬요. 3개까지 고정해요."}
          </span>
        </span>
      </label>
      {isPublished ? (
        <div className="notice-form__edited">
          <p className="notice-form__hint">고친 내용은 참가자에게 "수정됨"으로 보여요.</p>
          {contentChanged ? (
            <label className="notice-form__toggle">
              <input type="checkbox" checked={notify} onChange={(change) => setNotify(change.target.checked)} />
              <span>
                <strong>다시 알림</strong>
                <span className="notice-form__hint">중요한 정정이면 켜 주세요. 받는 사람에게 "공지 수정" 알림이 가요.</span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
      {failure && failure.kind !== "conflict" ? (
        <div className="notice-form__alert" role="alert">
          <p>{failureCopy(failure)}</p>
          {pinnedTitles.length > 0 ? (
            <ul className="notice-form__pinned">
              {pinnedTitles.map((item) => (
                <li key={item.noticeId}>
                  <Link className="notices__link" to={noticesHref(eventId, item.noticeId)}>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="notice-form__actions">
        {!notice || notice.status === "DRAFT" ? (
          <>
            <Button type="submit" variant="primary" size={48} loading={pending === "publish"} disabled={pending !== null}>
              발행
            </Button>
            <Button
              type="button"
              variant="secondary"
              size={48}
              loading={pending === "save"}
              disabled={pending !== null}
              onClick={() => void submit("save")}
            >
              초안으로 저장
            </Button>
          </>
        ) : (
          <Button type="submit" variant="primary" size={48} loading={pending === "save"} disabled={pending !== null}>
            저장
          </Button>
        )}
      </div>
    </form>
  );
}

function changedKeys(notice: OperatorNotice, input: NoticeInput): Partial<NoticeInput> {
  const out: Partial<NoticeInput> = {};
  if (input.title !== notice.title) out.title = input.title;
  if (input.body !== notice.body) out.body = input.body;
  if (input.important !== notice.important) out.important = input.important;
  if (input.pinned !== notice.pinned) out.pinned = input.pinned;
  if (input.audience !== notice.audience) out.audience = input.audience;
  return out;
}

function failureCopy(failure: Failure): string {
  if (failure.kind === "pin") return "고정은 3개까지예요. 다른 고정을 풀어 주세요.";
  if (failure.kind === "field") {
    if (failure.field === "title") return `제목은 ${NOTICE_TITLE_MAX}자까지 쓸 수 있어요.`;
    if (failure.field === "body") return `내용은 ${NOTICE_BODY_MAX.toLocaleString("ko-KR")}자까지 쓸 수 있어요.`;
    return "입력한 내용을 확인해 주세요.";
  }
  if (failure.kind === "forbidden") return "공지를 쓸 권한이 없어요.";
  if (failure.kind === "archived") return "보관된 행사라 공지를 쓸 수 없어요.";
  if (failure.kind === "state") return "공지 상태가 바뀌었어요. 목록에서 다시 열어 주세요.";
  return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
