import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { isApiError } from "../../api/errors";
import type { EventDetail } from "../../api/events";
import {
  conflictEditor,
  deleteNotice,
  getNotice,
  listNotices,
  noticeCommand,
  patchNotice,
  pinLimitIds,
  type NoticeCommand,
  type OperatorNotice,
} from "../../api/notices";
import { reloadQuery } from "../../api/queryClient";
import { queryKeys } from "../../api/queryKeys";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { EventScreen } from "../EventScreen";
import { NoticeBadges, NoticeShell } from "./EventNotices";
import type { NoticeFlash } from "./NoticeEditor";
import { AUDIENCE_HINT, noticesHref, noticeStamp, notifiedCopy, PIN_LIMIT_COPY } from "./noticeCopy";
import { useNoticeAccess } from "./noticeAccess";
import { NoticeText } from "./NoticeText";
import "./Notices.css";

export function NoticeDetail() {
  const { eventId = "", noticeId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <DetailBody key={noticeId} event={event} spaceName={spaceName} noticeId={noticeId} />}
    </EventScreen>
  );
}

type Action = "publish" | "archive" | "unarchive" | "delete" | "pin" | "unpin";

function DetailBody({ event, spaceName, noticeId }: { event: EventDetail; spaceName?: string; noticeId: string }) {
  const eventId = event.eventId;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const access = useNoticeAccess(event);
  const notice = useQuery({
    queryKey: queryKeys.notice(eventId, noticeId),
    queryFn: ({ signal }) => getNotice(eventId, noticeId, signal),
  });
  const arrived = (location.state as NoticeFlash | null) ?? null;
  const [message, setMessage] = useState<string | null>(() => flashCopy(arrived));
  const [alert, setAlert] = useState<{ text: string; pinned?: string[] } | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const pinnedList = useQuery({
    queryKey: queryKeys.noticeList(eventId, "PUBLISHED-head"),
    queryFn: ({ signal }) => listNotices(eventId, { status: ["PUBLISHED"], limit: 10 }, signal),
    enabled: Boolean(alert?.pinned),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notices(eventId) });
  }

  async function run(action: Action, current: OperatorNotice) {
    setPending(action);
    setAlert(null);
    setMessage(null);
    try {
      if (action === "delete") {
        await deleteNotice(eventId, current.noticeId, current.version);
        queryClient.removeQueries({ queryKey: queryKeys.notice(eventId, current.noticeId) });
        invalidate();
        navigate(`${noticesHref(eventId)}?status=DRAFT`, { replace: true });
        return;
      }
      if (action === "pin" || action === "unpin") {
        const result = await patchNotice(eventId, current.noticeId, { expectedVersion: current.version, pinned: action === "pin" });
        queryClient.setQueryData(queryKeys.notice(eventId, current.noticeId), result.notice);
        setMessage(action === "pin" ? "고정했어요." : "고정을 풀었어요.");
      } else {
        const result = await noticeCommand(eventId, current.noticeId, action as NoticeCommand, current.version);
        queryClient.setQueryData(queryKeys.notice(eventId, current.noticeId), result.notice);
        setMessage(commandCopy(result.result, result.notifiedCount));
      }
      invalidate();
    } catch (error) {
      const ids = pinLimitIds(error);
      if (ids) setAlert({ text: PIN_LIMIT_COPY, pinned: ids });
      else if (isApiError(error, "CONCURRENT_MODIFICATION")) {
        const editor = conflictEditor(error);
        setAlert({ text: `${editor ? `${editor}님이` : "다른 운영자가"} 먼저 고쳤어요. 지금 내용을 다시 불러왔어요. 확인하고 다시 눌러 주세요.` });
        invalidate();
      } else if (isApiError(error, "FORBIDDEN")) setAlert({ text: "공지를 바꿀 권한이 없어요." });
      else if (isApiError(error, "EVENT_ARCHIVED")) setAlert({ text: "보관된 행사라 공지를 바꿀 수 없어요." });
      else if (isApiError(error, "INVALID_STATE_TRANSITION", "RESOURCE_NOT_FOUND")) {
        setAlert({ text: "공지 상태가 바뀌었어요. 지금 상태를 다시 불러왔어요." });
        invalidate();
      } else setAlert({ text: "처리하지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setPending(null);
      setConfirm(null);
    }
  }

  let content;
  if (notice.isPending) content = <p className="notices__support">불러오는 중이에요.</p>;
  else if (isApiError(notice.error, "RESOURCE_NOT_FOUND")) {
    content = (
      <div className="notices__retry">
        <p className="notices__support">공지를 찾을 수 없어요. 지워졌을 수 있어요.</p>
        <Link className="notices__link" to={noticesHref(eventId)}>
          공지 목록으로
        </Link>
      </div>
    );
  } else if (notice.isError || !notice.data) {
    content = (
      <div className="notices__retry">
        <p className="notices__support">불러오지 못했어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(notice)}>
          다시 시도
        </Button>
      </div>
    );
  } else {
    const current = notice.data;
    const pinnedTitles = alert?.pinned
      ? (pinnedList.data?.items ?? []).filter((item) => alert.pinned!.includes(item.noticeId))
      : [];
    content = (
      <article className="notice-detail">
        <NoticeBadges notice={current} />
        <h2 className="notice-detail__title">{current.title}</h2>
        <p className="notice-detail__meta">
          {metaLine(current)}
        </p>
        <NoticeText text={current.body} className="notice-text notice-detail__body" />
        <p className="notice-form__hint">{AUDIENCE_HINT[current.audience]}</p>
        {message ? (
          <p className="notice-detail__message" role="status">
            {message}
          </p>
        ) : null}
        {alert ? (
          <div className="notice-form__alert" role="alert">
            <p>{alert.text}</p>
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
        {access.readOnlyNote ? <p className="notices__note">{access.readOnlyNote}</p> : null}
        {access.canWrite ? (
          <div className="notice-form__actions">
            {current.status === "DRAFT" ? (
              <Button type="button" variant="primary" size={48} loading={pending === "publish"} disabled={pending !== null} onClick={() => void run("publish", current)}>
                발행
              </Button>
            ) : null}
            {current.status !== "ARCHIVED" ? (
              <Button
                type="button"
                variant="secondary"
                size={48}
                disabled={pending !== null}
                onClick={() => navigate(noticesHref(eventId, current.noticeId, "edit"))}
              >
                고치기
              </Button>
            ) : null}
            {current.status === "PUBLISHED" ? (
              <Button
                type="button"
                variant="secondary"
                size={48}
                loading={pending === "pin" || pending === "unpin"}
                disabled={pending !== null}
                onClick={() => void run(current.pinned ? "unpin" : "pin", current)}
              >
                {current.pinned ? "고정 풀기" : "고정"}
              </Button>
            ) : null}
            {current.status !== "ARCHIVED" ? (
              <Button type="button" variant="tertiary" size={48} disabled={pending !== null} onClick={() => setConfirm("archive")}>
                보관
              </Button>
            ) : (
              <Button type="button" variant="secondary" size={48} loading={pending === "unarchive"} disabled={pending !== null} onClick={() => void run("unarchive", current)}>
                보관 해제
              </Button>
            )}
            {current.status === "DRAFT" ? (
              <Button type="button" variant="danger-outline" size={48} disabled={pending !== null} onClick={() => setConfirm("delete")}>
                지우기
              </Button>
            ) : null}
          </div>
        ) : null}
        {confirm ? (
          <ConfirmDialog
            title={confirm === "delete" ? "초안을 지울까요?" : "공지를 보관할까요?"}
            onClose={() => {
              if (pending === null) setConfirm(null);
            }}
            footer={
              <>
                <Button type="button" variant="secondary" size={48} disabled={pending !== null} onClick={() => setConfirm(null)}>
                  취소
                </Button>
                <Button
                  type="button"
                  variant={confirm === "delete" ? "danger" : "primary"}
                  size={48}
                  loading={pending === confirm}
                  disabled={pending !== null}
                  onClick={() => void run(confirm, current)}
                >
                  {confirm === "delete" ? "지우기" : "보관"}
                </Button>
              </>
            }
          >
            <p className="notices__support">
              {confirm === "delete"
                ? "지운 초안은 되돌릴 수 없어요."
                : "참가자 목록과 행사 홈에서 사라져요. 보관 목록에서 다시 꺼낼 수 있어요."}
            </p>
          </ConfirmDialog>
        ) : null}
      </article>
    );
  }

  return (
    <NoticeShell event={event} spaceName={spaceName} title="공지" back={noticesHref(eventId)} backLabel="공지 목록">
      <div className="notices">{content}</div>
    </NoticeShell>
  );
}

function metaLine(notice: OperatorNotice): string {
  const parts: string[] = [];
  if (notice.createdByDisplayName) parts.push(`${notice.createdByDisplayName} 작성`);
  if (notice.publishedAt) parts.push(`발행 ${noticeStamp(notice.publishedAt)}`);
  else parts.push(`저장 ${noticeStamp(notice.updatedAt)}`);
  if (notice.editedAt) parts.push(`수정됨 ${noticeStamp(notice.editedAt)}`);
  if (notice.archivedAt) parts.push(`보관 ${noticeStamp(notice.archivedAt)}`);
  if (notice.updatedByDisplayName && notice.updatedByDisplayName !== notice.createdByDisplayName) {
    parts.push(`마지막 변경 ${notice.updatedByDisplayName}`);
  }
  return parts.join(" · ");
}

function flashCopy(flash: NoticeFlash | null): string | null {
  if (!flash) return null;
  if (flash.saved === "edited" && flash.notified !== undefined) return `저장했어요. ${notifiedCopy(flash.notified)}`;
  if (flash.notified !== undefined) return `발행했어요. ${notifiedCopy(flash.notified)}`;
  if (flash.saved === "draft") return "초안으로 저장했어요.";
  if (flash.saved === "edited") return "저장했어요.";
  return null;
}

function commandCopy(result: string, notified: number): string {
  if (result === "PUBLISHED") return `발행했어요. ${notifiedCopy(notified)}`;
  if (result === "ALREADY_PUBLISHED") return "이미 발행된 공지예요.";
  if (result === "ARCHIVED") return "보관했어요. 참가자 화면에서 사라졌어요.";
  if (result === "ALREADY_ARCHIVED") return "이미 보관된 공지예요.";
  return "보관을 해제했어요.";
}
