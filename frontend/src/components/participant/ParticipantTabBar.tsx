import { Link, useLocation } from "react-router";
import type { ParticipantFeatures } from "../../api/participantHome";
import { participantPath, tabOfPath, visibleTabs, type ParticipantTabKey } from "./participantTabs";

/**
 * Bottom tabs (DEC-080 §1), shaped like the operator bottom bar (#368): within thumb reach, above the
 * phone's safe area. Only tabs whose area is on show; the order stays fixed.
 */
export function ParticipantTabBar({ eventId, features }: { eventId: string; features: ParticipantFeatures | null }) {
  const { pathname } = useLocation();
  const current = tabOfPath(eventId, pathname);
  return (
    <nav className="participant-tabs" aria-label="참가자 메뉴">
      <ul className="participant-tabs__list">
        {visibleTabs(features).map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                className={`participant-tabs__item${active ? " participant-tabs__item--current" : ""}`}
                to={participantPath(eventId, tab.key)}
                aria-current={active ? "page" : undefined}
              >
                <TabIcon tab={tab.key} />
                <span className="participant-tabs__label">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const ICONS: Record<ParticipantTabKey, string> = {
  home: "M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z",
  schedule: "M5 6.5h14v13H5zM5 10.5h14M9 4v4M15 4v4",
  notices: "M5 10v4h3l6 4V6l-6 4zM17.5 9.5a3.5 3.5 0 0 1 0 5",
  group: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.5a3 3 0 0 1 0 5.5M17 14.2a5.5 5.5 0 0 1 3.5 4.8",
  me: "M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0",
};

function TabIcon({ tab }: { tab: ParticipantTabKey }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[tab]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
