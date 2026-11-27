import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import type { EventDetail } from "../api/events";
import {
  listOperatorNotifications,
  markOperatorNotificationsRead,
  type NotificationReadBody,
  type OperatorNotification,
  type OperatorUpdates,
} from "../api/operatorNotifications";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { formatSubmittedAt } from "./eventFormat";
import { EventScreen } from "./EventScreen";
import { readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import { notificationHref } from "./notificationHref";
import "./EventNotifications.css";

/** 운영자 알림 (#436): this event's list for the signed-in operator, newest first. */
export function EventNotifications() {
  const { eventId = "" } = useParams();
  return <EventScreen eventId={eventId}>{(event, spaceName) => <Body event={event} spaceName={spaceName} />}</EventScreen>;
}

function Body({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const eventHref = `/events/${eventId}`;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: queryKeys.operatorNotifications(eventId),
    queryFn: ({ pageParam, signal }) => listOperatorNotifications(eventId, pageParam, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = list.data?.pages[0]?.unreadCount ?? 0;

  const read = useMutation({
    mutationFn: (body: NotificationReadBody) => markOperatorNotificationsRead(eventId, body),
    onSuccess: (unreadCount) => {
      queryClient.setQueryData<OperatorUpdates>(queryKeys.operatorUpdates(eventId), (old) =>
        old ? { ...old, notifications: { ...old.notifications, unreadCount } } : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatorNotifications(eventId) });
    },
  });

  function open(item: OperatorNotification) {
    const href = notificationHref(eventId, item);
    if (item.readAt === null) read.mutate({ notificationIds: [item.notificationId] });
    if (href) navigate(href);
  }

  return (
    <OperatorShell
      title="알림"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={readEventAreas(eventId)}
      participantsHref={`${eventHref}/participants`}
      tasksHref={`${eventHref}/tasks`}
      framed
      action={
        <Button
          type="button"
          variant="secondary"
          size={40}
          disabled={unread === 0 || read.isPending || items.length === 0}
          onClick={() => read.mutate({ upToSeq: items[0].seq })}
        >
          모두 읽음
        </Button>
      }
    >
      <div className="event-notifications">
        {/* The title and the sidebar already name this event's 알림: only the unread count is new (#495). */}
        {unread > 0 ? (
          <p className="event-notifications__lead">읽지 않은 알림 {unread > 99 ? "99+" : unread}개</p>
        ) : null}
        {list.isPending ? (
          <p role="status">불러오는 중이에요.</p>
        ) : list.isError ? (
          <div className="event-notifications__empty" role="alert">
            <p>알림을 불러오지 못했어요.</p>
            <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(list)}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="event-notifications__empty" role="status">
            아직 알림이 없어요. 참가자가 신청을 고치거나 취소하면 여기에 떠요.
          </p>
        ) : (
          <ul className="event-notifications__list" aria-label="알림 목록">
            {items.map((item) => (
              <li key={item.notificationId}>
                <NotificationRow item={item} href={notificationHref(eventId, item)} onOpen={() => open(item)} />
              </li>
            ))}
          </ul>
        )}
        {read.isError ? (
          <p className="event-notifications__error" role="alert">
            읽음으로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.
          </p>
        ) : null}
        {list.hasNextPage ? (
          <Button
            type="button"
            variant="secondary"
            size={40}
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
          </Button>
        ) : null}
      </div>
    </OperatorShell>
  );
}

function NotificationRow({ item, href, onOpen }: { item: OperatorNotification; href: string | null; onOpen: () => void }) {
  const unread = item.readAt === null;
  const content = (
    <>
      <span className="event-notifications__dot" aria-hidden="true" />
      <span className="event-notifications__text">
        <span className="event-notifications__title">
          {unread ? <span className="event-notifications__sr">읽지 않음 </span> : null}
          {item.title}
          {/* A space and a dot keep the title and the count apart, also as text (#539). */}
          {item.count > 1 ? <span className="event-notifications__count"> · {item.count}번</span> : null}
        </span>
        {item.body ? <span className="event-notifications__body">{item.body}</span> : null}
        <time className="event-notifications__time" dateTime={item.createdAt}>
          {formatSubmittedAt(item.createdAt)}
        </time>
      </span>
    </>
  );
  const className = `event-notifications__item${unread ? " event-notifications__item--unread" : ""}${item.important ? " event-notifications__item--important" : ""}`;
  if (!href) {
    // Not openable (unknown kind or no screen yet); still marks read when tapped.
    return unread ? (
      <button type="button" className={`${className} scene-press scene-press--row scene-press--inset`} onClick={onOpen}>
        {content}
      </button>
    ) : (
      <div className={className}>{content}</div>
    );
  }
  return (
    <a
      className={`${className} scene-press scene-press--row scene-press--inset`}
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onOpen();
      }}
    >
      {content}
    </a>
  );
}
