import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Routes, useParams } from "react-router";
import { isApiError } from "../../api/errors";
import { getParticipantNotice, markNoticeRead, type ParticipantNotice } from "../../api/notices";
import { reloadQuery } from "../../api/queryClient";
import { Button } from "../Button";
import { noticeClock, noticeStamp } from "../notices/noticeCopy";
import { NoticeText } from "../notices/NoticeText";
import "../notices/Notices.css";
import { EmptyNote } from "./HomeCard";
import { markReadInList, participantNoticeDetail, useParticipantNoticeList } from "./noticeQuery";
import { useParticipantFeed } from "./participantFeed";
import { participantPath } from "./participantTabs";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

/** 공지 tab (`/participate/{eventId}/notices`, D4): the list, and a notice at `notices/{noticeId}`. */
export function NoticesTab() {
  return (
    <Routes>
      <Route index element={<NoticeListView />} />
      <Route path=":noticeId" element={<NoticeDetailView />} />
    </Routes>
  );
}

function NoticeListView() {
  const { eventId } = useParticipantFeed();
  const list = useParticipantNoticeList(eventId);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="participant-tab" aria-labelledby="participant-notices-title">
      <h1 id="participant-notices-title" className="participant-tab__title">
        공지
      </h1>
      {list.isPending ? <EmptyNote>불러오는 중이에요.</EmptyNote> : null}
      {list.isError && items.length === 0 ? (
        <div className="notices__retry">
          <EmptyNote>공지를 불러오지 못했어요.</EmptyNote>
          <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(list)}>
            다시 시도
          </Button>
        </div>
      ) : null}
      {list.isSuccess && items.length === 0 ? <EmptyNote>아직 올라온 공지가 없어요. 공지가 올라오면 여기에 보여요.</EmptyNote> : null}
      {items.length > 0 ? (
        <ul className="notices__rows">
          {items.map((notice) => (
            <li key={notice.noticeId}>
              <ParticipantNoticeRow eventId={eventId} notice={notice} />
            </li>
          ))}
        </ul>
      ) : null}
      {list.hasNextPage ? (
        <Button type="button" variant="secondary" size={40} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          더 보기
        </Button>
      ) : null}
    </section>
  );
}

export function ParticipantNoticeBadges({ notice }: { notice: ParticipantNotice }) {
  if (!notice.unread && !notice.pinned && !notice.important && !notice.leadersOnly) return null;
  return (
    <span className="notice-badges">
      {notice.unread ? <span className="notice-badge notice-badge--new">새 공지</span> : null}
      {notice.pinned ? <span className="notice-badge notice-badge--pin">고정</span> : null}
      {notice.important ? <span className="notice-badge notice-badge--important">중요</span> : null}
      {notice.leadersOnly ? <span className="notice-badge notice-badge--audience">조장 공지</span> : null}
    </span>
  );
}

export function ParticipantNoticeRow({ eventId, notice, compact = false }: { eventId: string; notice: ParticipantNotice; compact?: boolean }) {
  return (
    <Link
      className={`notice-row scene-press scene-press--card${notice.important ? " notice-row--important scene-press--keep-border" : ""}`}
      to={participantPath(eventId, "notices", notice.noticeId)}
    >
      <ParticipantNoticeBadges notice={notice} />
      <span className="notice-row__title">{notice.title}</span>
      {compact ? null : <span className="notice-row__preview">{notice.bodyPreview}</span>}
      <span className="notice-row__meta">
        {noticeStamp(notice.publishedAt)}
        {notice.editedAt ? ` · 수정됨 ${noticeClock(notice.editedAt)}` : ""}
      </span>
    </Link>
  );
}

function NoticeDetailView() {
  const { noticeId = "" } = useParams();
  const { eventId, reportUnread } = useParticipantFeed();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: participantNoticeDetail(eventId, noticeId),
    queryFn: ({ signal }) => getParticipantNotice(noticeId, signal),
    ...participantCardQuery,
  });
  useSessionGuard(detail.error);
  // Reading does not mark it read (api.md): opening the notice does, once per notice.
  const marked = useRef<string | null>(null);
  const shown = detail.data?.noticeId;
  useEffect(() => {
    if (!shown || marked.current === shown) return;
    marked.current = shown;
    markNoticeRead(shown)
      .then(({ unreadCount }) => {
        // The 알림함 bell drops now, not at the next `updates` (B5 #463).
        reportUnread(unreadCount);
        markReadInList(queryClient, eventId, shown);
      })
      .catch(() => {
        // Not fatal: the next open tries again; "새 공지" stays until then.
        marked.current = null;
      });
  }, [shown, eventId, queryClient, reportUnread]);

  const back = (
    <Link className="participant-card__link" to={participantPath(eventId, "notices")}>
      공지 목록으로
    </Link>
  );

  if (detail.isPending) {
    return (
      <section className="participant-tab">
        <EmptyNote>불러오는 중이에요.</EmptyNote>
      </section>
    );
  }
  if (isApiError(detail.error, "RESOURCE_NOT_FOUND")) {
    return (
      <section className="participant-tab" aria-labelledby="participant-notice-missing">
        <h1 id="participant-notice-missing" className="participant-tab__title">
          공지를 볼 수 없어요
        </h1>
        <EmptyNote>내려간 공지이거나 볼 수 있는 대상이 아니에요.</EmptyNote>
        {back}
      </section>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <section className="participant-tab">
        <EmptyNote>공지를 불러오지 못했어요.</EmptyNote>
        <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(detail)}>
          다시 시도
        </Button>
        {back}
      </section>
    );
  }
  const notice = detail.data;
  return (
    <article className="participant-tab notice-detail" aria-labelledby="participant-notice-title">
      {back}
      <ParticipantNoticeBadges notice={{ ...notice, unread: false }} />
      <h1 id="participant-notice-title" className="participant-tab__title notice-detail__title">
        {notice.title}
      </h1>
      <p className="notice-detail__meta">
        {noticeStamp(notice.publishedAt)}
        {notice.editedAt ? ` · 수정됨 ${noticeClock(notice.editedAt)}` : ""}
      </p>
      <NoticeText text={notice.body} className="notice-text notice-detail__body" />
    </article>
  );
}
