import events from "../assets/event-nav/events.svg";
import bell from "../assets/event-nav/bell.svg";
import note from "../assets/event-nav/note.svg";
import clipboard from "../assets/event-nav/clipboard.svg";
import envelope from "../assets/event-nav/envelope.svg";
import calendar from "../assets/event-nav/calendar.svg";
import chartLine from "../assets/event-nav/chart-line.svg";
import people from "../assets/event-nav/users-three.svg";
import address from "../assets/event-nav/address.svg";
import briefcase from "../assets/event-nav/briefcase.svg";
import squares from "../assets/event-nav/squares.svg";
import gear from "../assets/event-nav/gear.svg";

export function matchesPath(pathname: string, href?: string): boolean {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Organization sidebar: organization menus only (#376). Event operation menus (준비 업무, 현장 운영,
 * 참가 현황, 운영 멤버) live inside an event. Menus without a screen yet open the shared "준비 중" page
 * at their own address.
 */
const primary = [
  { key: "events" as const, label: "행사", icon: events, to: "/events" },
  { key: "notifications" as const, label: "알림", icon: bell, to: "/notifications" },
  { key: "members" as const, label: "멤버", icon: people, to: "/members" },
  { key: "history" as const, label: "기록", icon: note, to: "/history" },
  { key: "guides" as const, label: "안내", icon: envelope, to: "/guides" },
  { key: "schedule" as const, label: "일정", icon: calendar, to: "/schedule" },
];

const system = [
  { key: "integrations" as const, label: "연동", icon: squares, to: "/integrations" },
  { key: "settings" as const, label: "설정", icon: gear, to: "/settings" },
];

export type OperatorMenu = {
  eventName?: string;
  eventHref?: string;
  eventAreas?: string[];
  participantsHref?: string;
  tasksHref?: string;
  spaceName?: string;
  /** Unread notifications of this event as badge text ("3", "99+"), or null (#436). Events only. */
  notificationsBadge?: string | null;
};

/** Stable keys let the phone bottom bar (#368) pick its shortcuts out of the same menu. */
export type MenuKey =
  | "events"
  | "notifications"
  | "members"
  | "history"
  | "tasks"
  | "guides"
  | "schedule"
  | "field"
  | "participants"
  | "operators"
  | "integrations"
  | "settings"
  | "event"
  | "groups"
  | "notices"
  | "areas";

export type MenuItem = { key: MenuKey; label: string; icon: string; to?: string; current: boolean; badge?: string | null };
export type MenuSection = { label?: string; items: MenuItem[] };

/** The operator menu for this place: the organization menus, or the menus of one event. */
export function operatorMenuSections(menu: OperatorMenu, pathname: string): MenuSection[] {
  const { eventName, eventHref, eventAreas = [], participantsHref, tasksHref, notificationsBadge = null } = menu;
  const item = (key: MenuKey, label: string, icon: string, to: string | undefined, current = matchesPath(pathname, to)) => ({
    key,
    label,
    icon,
    to,
    current,
  });
  if (!eventName) {
    return [
      { items: primary.map((menu) => item(menu.key, menu.label, menu.icon, menu.to)) },
      { items: system.map((menu) => item(menu.key, menu.label, menu.icon, menu.to)) },
    ];
  }
  // 알림 inside an event is that event's list with its unread badge (#436, DEC-080 §7.5).
  const sections: MenuSection[] = [
    {
      items: [
        item("event", eventName, events, eventHref, Boolean(eventHref) && pathname === eventHref),
        ...(eventHref
          ? [{ ...item("notifications", "알림", bell, `${eventHref}/notifications`), badge: notificationsBadge }]
          : []),
      ],
    },
  ];
  if (eventHref) {
    sections.push({
      label: "행사 운영",
      items: [
        ...(eventAreas.includes("tasks") ? [item("tasks", "준비 업무", clipboard, tasksHref)] : []),
        ...(eventAreas.includes("participants") ? [item("participants", "참가 현황", address, participantsHref)] : []),
        item("field", "현장 운영", chartLine, `${eventHref}/field`),
        item("groups", "조 편성", people, `${eventHref}/groups`),
        item("notices", "공지", envelope, `${eventHref}/notices`),
        item("operators", "운영 멤버", briefcase, `${eventHref}/operators`),
      ],
    });
  }
  sections.push({
    items: [
      item("areas", "다른 기능 시작", squares, eventHref ? `${eventHref}/areas` : undefined),
      item("settings", "설정", gear, eventHref ? `${eventHref}/settings` : undefined),
    ],
  });
  return sections;
}


/**
 * Phone bottom bar shortcuts (#368): what operators check most, picked from the same menu so labels,
 * addresses and the current page match the sidebar. Outside an event only organization menus
 * (행사 · 알림 · 멤버, #376); inside an event 홈 · 현장 운영 · 참가 현황 · 알림. Inside an event 알림
 * is that event's list with the unread badge (#436); while the event is still loading it falls back
 * to the organization's page. 참가 현황 shows only when that area is on; everything else is in 전체
 * 메뉴.
 */
export function bottomNavItems(menu: OperatorMenu, pathname: string): MenuItem[] {
  const all = operatorMenuSections(menu, pathname).flatMap((section) => section.items);
  const pick = (keys: MenuKey[]) =>
    keys.flatMap((key) => {
      const found = all.find((item) => item.key === key && item.to);
      if (!found) return [];
      return [key === "event" ? { ...found, label: "홈" } : found];
    });
  const notifications = all.find((item) => item.key === "notifications" && item.to) ?? {
    key: "notifications" as const,
    label: "알림",
    icon: bell,
    to: "/notifications",
    current: matchesPath(pathname, "/notifications"),
  };
  if (!menu.eventName) return pick(["events", "notifications", "members"]);
  return [...pick(["event", "field", "participants"]), notifications];
}
