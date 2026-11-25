import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import type { ParticipantFeatureKey } from "../../api/participantHome";
import symbol from "../../assets/scene-symbol-header.svg";
import "../ParticipantGate.css";
import "./ParticipantShell.css";
import { GroupTab } from "./GroupTab";
import { HomeTab } from "./HomeTab";
import { InboxBell, InboxScreen } from "./InboxScreen";
import { MeTab } from "./MeTab";
import { NoticesTab } from "./NoticesTab";
import { ParticipantTabBar } from "./ParticipantTabBar";
import { RoomsScreen } from "./RoomsScreen";
import { ScheduleTab } from "./ScheduleTab";
import { EmptyNote } from "./HomeCard";
import { useParticipantHomeQuery } from "./homeQuery";
import { clockText, ParticipantFeedContext, type ParticipantFeed } from "./participantFeed";
import { participantPath } from "./participantTabs";
import { useParticipantUpdates } from "./useParticipantUpdates";

/**
 * The signed-in participant screen (#425, DEC-080): header, the tab under the address, bottom tabs.
 * `home` decides which tabs show; once it has answered, the poll starts from the `updates` it carried.
 */
export function ParticipantShell({
  eventId,
  name,
  onLeave,
}: {
  eventId: string;
  name: string;
  /** Logout (`left`) or a lost session: drop participant reads and show the sign-in screen. */
  onLeave: (left: boolean) => void;
}) {
  const home = useParticipantHomeQuery(eventId);
  const sessionLost = useCallback(() => onLeave(false), [onLeave]);
  // Once home has answered (or failed) the tabs stay; a later reload keeps them on screen.
  const [settled, setSettled] = useState(false);
  if (!settled && !home.isPending) setSettled(true);
  return settled ? (
    <Feed eventId={eventId} name={name} home={home.data ?? null} sessionLost={sessionLost} onLeave={onLeave} />
  ) : (
    <Frame eventId={eventId} features={null} status={null} bell={null}>
      <EmptyNote>불러오는 중이에요.</EmptyNote>
    </Frame>
  );
}

function Feed({
  eventId,
  name,
  home,
  sessionLost,
  onLeave,
}: {
  eventId: string;
  name: string;
  home: ParticipantFeed["home"];
  sessionLost: () => void;
  onLeave: (left: boolean) => void;
}) {
  const poll = useParticipantUpdates({ eventId, initial: home?.updates ?? null, enabled: true, onSessionLost: sessionLost });
  const features = home?.features ?? null;
  // A read's answer wins until the next good `updates`, which is the server's word again.
  const [readBack, setReadBack] = useState<{ count: number; at: number | null } | null>(null);
  const unreadCount = readBack && readBack.at === poll.lastSuccessAt ? readBack.count : poll.unreadCount;
  const lastSuccessAt = poll.lastSuccessAt;
  const reportUnread = useCallback((count: number) => setReadBack({ count, at: lastSuccessAt }), [lastSuccessAt]);
  const feed = useMemo<ParticipantFeed>(
    () => ({ eventId, name, home, features, poll, sessionLost, unreadCount, reportUnread }),
    [eventId, name, home, features, poll, sessionLost, unreadCount, reportUnread],
  );
  const status = poll.offline
    ? `연결이 끊겼어요${poll.lastSuccessAt ? ` · 마지막 갱신 ${clockText(poll.lastSuccessAt)}` : ""}`
    : poll.failing
      ? `새 소식을 확인하지 못했어요${poll.lastSuccessAt ? ` · 마지막 갱신 ${clockText(poll.lastSuccessAt)}` : ""}`
      : null;
  const area = (feature: ParticipantFeatureKey, element: ReactNode) =>
    features?.[feature] ? element : <Navigate to={participantPath(eventId, "home")} replace />;

  return (
    <ParticipantFeedContext.Provider value={feed}>
      <Frame eventId={eventId} features={features} status={status} bell={<InboxBell eventId={eventId} unread={unreadCount} />}>
        <Routes>
          <Route index element={<HomeTab />} />
          <Route path="schedule/*" element={area("schedule", <ScheduleTab />)} />
          <Route path="notices/*" element={area("notices", <NoticesTab />)} />
          <Route path="group/*" element={area("groups", <GroupTab />)} />
          {/* 숙소 opens from the home card and stays under the 홈 tab (DEC-085 Follow-up, G4 #459). */}
          <Route path="rooms/*" element={area("rooms", <RoomsScreen />)} />
          {/* 알림함 (B5 #463): opened from the header bell, under the 홈 tab like 숙소. */}
          <Route path="inbox/*" element={<InboxScreen />} />
          <Route path="me/*" element={<MeTab onLeave={() => onLeave(true)} />} />
          <Route path="*" element={<Navigate to={participantPath(eventId, "home")} replace />} />
        </Routes>
      </Frame>
    </ParticipantFeedContext.Provider>
  );
}

function Frame({
  eventId,
  features,
  status,
  bell,
  children,
}: {
  eventId: string;
  features: ParticipantFeed["features"];
  status: string | null;
  bell: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="participant-shell">
      <header className="participant-shell__header">
        <Link className="participant-gate__brand" to={participantPath(eventId, "home")} aria-label="참가자 홈">
          <img src={symbol} alt="" width={32} height={32} aria-hidden="true" />
          <span className="scene-wordmark">SCENE</span>
        </Link>
        {/* B5 #463: the bell stays on every tab; the five bottom tabs stay as they are (DEC-080 Follow-up). */}
        <div className="participant-shell__actions">{bell}</div>
      </header>
      {status ? (
        <p className="participant-shell__status" role="status">
          {status}
        </p>
      ) : null}
      <main className="participant-shell__main">{children}</main>
      <ParticipantTabBar eventId={eventId} features={features} />
    </div>
  );
}
