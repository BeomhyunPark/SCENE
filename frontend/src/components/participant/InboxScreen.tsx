import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { badgeText } from "../../api/operatorNotifications";
import {
  listParticipantNotifications,
  markParticipantNotificationsRead,
  type ParticipantNotification,
  type ParticipantNotificationReadBody,
} from "../../api/participantNotifications";
import { reloadQuery } from "../../api/queryClient";
import { queryKeys } from "../../api/queryKeys";
import { Button } from "../Button";
import { noticeStamp } from "../notices/noticeCopy";
import { EmptyNote } from "./HomeCard";
import { inboxHref, inboxPath } from "./inboxRoutes";
import { useParticipantFeed } from "./participantFeed";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";
import "./InboxScreen.css";

/**
 * The header bell (B5 #463, DEC-080 Follow-up): on every tab, with the unread count from `updates`.
 * It opens `/participate/{eventId}/inbox`, which stays under the 홈 tab.
 */
export function InboxBell({ eventId, unread }: { eventId: string; unread: number | null }) {
  const badge = badgeText(unread ?? 0);
  return (
    <Link className="participant-bell scene-press scene-press--quiet" to={inboxPath(eventId)} aria-label={badge ? `알림함, 읽지 않은 알림 ${unread}개` : "알림함"}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {badge ? (
        <span className="participant-bell__badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * 알림함 (B5 #463, DEC-080 §7.4): my notifications, newest first. The list is read once and again
 * only when `updates.notifications` changes (`updateTargets.ts`), so a publication shows up here
 * within one poll. Opening a row marks it read and goes to its screen (`inboxRoutes.ts`).
 */
export function InboxScreen() {
  const { eventId, features, reportUnread } = useParticipantFeed();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: queryKeys.participantNotifications(eventId),
    queryFn: ({ pageParam, signal }) => listParticipantNotifications(pageParam, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    ...participantCardQuery,
  });
  useSessionGuard(list.error);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = list.data?.pages[0]?.unreadCount ?? 0;

  const read = useMutation({
    mutationFn: (body: ParticipantNotificationReadBody) => markParticipantNotificationsRead(body),
    onSuccess: (count) => {
      reportUnread(count);
      void queryClient.invalidateQueries({ queryKey: queryKeys.participantNotifications(eventId) });
    },
  });
  useSessionGuard(read.error);

  function open(item: ParticipantNotification, href: string | null) {
    if (item.readAt === null) read.mutate({ notificationIds: [item.notificationId] });
    if (href) navigate(href);
  }

  return (
    <section className="participant-tab participant-inbox" aria-labelledby="participant-inbox-title">
      <div className="participant-inbox__head">
        <h1 id="participant-inbox-title" className="participant-tab__title">
          알림
        </h1>
        <Button
          type="button"
          variant="secondary"
          size={40}
          disabled={unread === 0 || read.isPending || items.length === 0}
          onClick={() => read.mutate({ upToSeq: items[0].seq })}
        >
          모두 읽음
        </Button>
      </div>
      {list.isPending ? <EmptyNote>불러오는 중이에요.</EmptyNote> : null}
      {list.isError && items.length === 0 ? (
        <div className="participant-inbox__retry">
          <EmptyNote>알림을 불러오지 못했어요.</EmptyNote>
          <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(list)}>
            다시 시도
          </Button>
        </div>
      ) : null}
      {list.isSuccess && items.length === 0 ? (
        <EmptyNote>아직 받은 알림이 없어요. 새 공지나 일정·조·숙소가 공개되면 여기에 보여요.</EmptyNote>
      ) : null}
      {items.length > 0 ? (
        <ul className="participant-inbox__rows">
          {items.map((item) => (
            <li key={item.notificationId}>
              <InboxRow item={item} href={inboxHref(eventId, item, features)} onOpen={open} />
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

function InboxRow({
  item,
  href,
  onOpen,
}: {
  item: ParticipantNotification;
  href: string | null;
  onOpen: (item: ParticipantNotification, href: string | null) => void;
}) {
  const unread = item.readAt === null;
  const className = [
    "participant-inbox__row",
    unread ? "participant-inbox__row--unread" : "",
    item.important ? "participant-inbox__row--important" : "",
    href ? "" : "participant-inbox__row--static",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span className="participant-inbox__title">
        {unread ? <span className="participant-inbox__dot" aria-label="읽지 않음" /> : null}
        {item.title}
        {item.count > 1 ? <span className="participant-inbox__count"> · {item.count}건</span> : null}
      </span>
      {item.body ? <span className="participant-inbox__body">{item.body}</span> : null}
      <span className="participant-inbox__meta">{noticeStamp(item.createdAt)}</span>
    </>
  );
  // A kind this screen cannot open is text only; it is still marked read with "모두 읽음".
  if (!href) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      className={`${className} scene-press scene-press--card${item.important ? " scene-press--keep-border" : ""}`}
      onClick={() => onOpen(item, href)}
    >
      {content}
    </button>
  );
}
