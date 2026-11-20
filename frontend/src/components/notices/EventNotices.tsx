import type { ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import arrowLeft from "../../assets/event-create/arrow-left.svg";
import type { EventDetail } from "../../api/events";
import { listNotices, type NoticeStatus, type OperatorNotice } from "../../api/notices";
import { reloadQuery } from "../../api/queryClient";
import { queryKeys } from "../../api/queryKeys";
import { Button } from "../Button";
import { EventScreen } from "../EventScreen";
import { OperatorShell } from "../OperatorShell";
import { readEventAreas } from "../eventLocalState";
import { AUDIENCE_LABEL, noticesHref, noticeStamp } from "./noticeCopy";
import { useNoticeAccess } from "./noticeAccess";
import "./Notices.css";

const FILTERS: { status: NoticeStatus; label: string; empty: string }[] = [
  { status: "PUBLISHED", label: "발행", empty: "발행한 공지가 없어요." },
  { status: "DRAFT", label: "초안", empty: "저장한 초안이 없어요." },
  { status: "ARCHIVED", label: "보관", empty: "보관한 공지가 없어요." },
];

/** The operator frame every notice screen shares: the event menus and a back arrow. */
export function NoticeShell({
  event,
  spaceName,
  title,
  back,
  backLabel,
  children,
}: {
  event: EventDetail;
  spaceName?: string;
  title: string;
  back: string;
  backLabel: string;
  children: ReactNode;
}) {
  const eventHref = `/events/${event.eventId}`;
  const areas = readEventAreas(event.eventId);
  return (
    <OperatorShell
      title={title}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={areas}
      participantsHref={areas.includes("participants") ? `${eventHref}/participants` : undefined}
      tasksHref={`${eventHref}/tasks`}
      framed
      leading={
        <Link className="event-home__back" to={back} aria-label={backLabel}>
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      {children}
    </OperatorShell>
  );
}

export function EventNotices() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <NoticeList event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function NoticeList({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const navigate = useNavigate();
  const eventId = event.eventId;
  const [search, setSearch] = useSearchParams();
  const filter = FILTERS.find((item) => item.status === search.get("status")) ?? FILTERS[0];
  const access = useNoticeAccess(event);
  // Read on entry, on window focus (React Query default) and after every write (invalidation).
  const notices = useInfiniteQuery({
    queryKey: queryKeys.noticeList(eventId, filter.status),
    queryFn: ({ pageParam, signal }) => listNotices(eventId, { status: [filter.status], before: pageParam, limit: 30 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = notices.data?.pages.flatMap((page) => page.items) ?? [];
  const pinnedCount = notices.data?.pages[0]?.pinnedCount ?? 0;

  return (
    <NoticeShell event={event} spaceName={spaceName} title="공지" back={`/events/${eventId}`} backLabel="행사 홈">
      <div className="notices">
        <div className="notices__head">
          <p className="notices__support">
            참가자와 운영진에게 보이는 공지예요. 고정 {pinnedCount}/3
          </p>
          {access.canWrite ? (
            <Button type="button" variant="primary" size={40} onClick={() => navigate(noticesHref(eventId, "new"))}>
              공지 쓰기
            </Button>
          ) : null}
        </div>
        {access.readOnlyNote ? <p className="notices__note">{access.readOnlyNote}</p> : null}
        <div className="notices__filters" role="group" aria-label="공지 거르기">
          {FILTERS.map((item) => (
            <button
              key={item.status}
              type="button"
              className="notices__filter"
              aria-pressed={item.status === filter.status}
              onClick={() => setSearch(item.status === "PUBLISHED" ? {} : { status: item.status }, { replace: true })}
            >
              {item.label}
            </button>
          ))}
        </div>
        {notices.isPending ? <p className="notices__support">불러오는 중이에요.</p> : null}
        {notices.isError ? (
          <div className="notices__retry">
            <p className="notices__support">불러오지 못했어요.</p>
            <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(notices)}>
              다시 시도
            </Button>
          </div>
        ) : null}
        {notices.isSuccess && items.length === 0 ? <p className="notices__empty">{filter.empty}</p> : null}
        {items.length > 0 ? (
          <ul className="notices__rows">
            {items.map((notice) => (
              <li key={notice.noticeId}>
                <NoticeRow eventId={eventId} notice={notice} />
              </li>
            ))}
          </ul>
        ) : null}
        {notices.hasNextPage ? (
          <Button
            type="button"
            variant="secondary"
            size={40}
            loading={notices.isFetchingNextPage}
            onClick={() => void notices.fetchNextPage()}
          >
            더 보기
          </Button>
        ) : null}
      </div>
    </NoticeShell>
  );
}

export function NoticeBadges({ notice }: { notice: Pick<OperatorNotice, "pinned" | "important" | "audience" | "status"> }) {
  return (
    <span className="notice-badges">
      {notice.pinned && notice.status === "PUBLISHED" ? <span className="notice-badge notice-badge--pin">고정</span> : null}
      {notice.important ? <span className="notice-badge notice-badge--important">중요</span> : null}
      <span className={`notice-badge${notice.audience === "ALL" ? "" : " notice-badge--audience"}`}>
        {AUDIENCE_LABEL[notice.audience]}
      </span>
      {notice.status === "DRAFT" ? <span className="notice-badge">초안</span> : null}
      {notice.status === "ARCHIVED" ? <span className="notice-badge">보관</span> : null}
    </span>
  );
}

function NoticeRow({ eventId, notice }: { eventId: string; notice: OperatorNotice }) {
  const when =
    notice.status === "DRAFT"
      ? `저장 ${noticeStamp(notice.updatedAt)}`
      : notice.publishedAt
        ? `발행 ${noticeStamp(notice.publishedAt)}`
        : `보관 ${noticeStamp(notice.archivedAt)}`;
  return (
    <Link className={`notice-row${notice.important ? " notice-row--important" : ""}`} to={noticesHref(eventId, notice.noticeId)}>
      <NoticeBadges notice={notice} />
      <span className="notice-row__title">{notice.title}</span>
      <span className="notice-row__preview">{notice.body}</span>
      <span className="notice-row__meta">
        {when}
        {notice.editedAt ? ` · 수정됨 ${noticeStamp(notice.editedAt)}` : ""}
      </span>
    </Link>
  );
}
