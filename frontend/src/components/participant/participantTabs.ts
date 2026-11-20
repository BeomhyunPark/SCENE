import type { ParticipantFeatureKey, ParticipantFeatures } from "../../api/participantHome";

/**
 * The five bottom tabs in their fixed order (DEC-080 §1). Each tab has its own address under the
 * event's participant address so reload, back and a shared link keep it; sub-pages (a notice detail,
 * the edit form) go under the tab's segment, e.g. `/participate/{eventId}/notices/{noticeId}`.
 */
export type ParticipantTabKey = "home" | "schedule" | "notices" | "group" | "me";

export type ParticipantTab = {
  key: ParticipantTabKey;
  label: string;
  /** Path segment after `/participate/{eventId}`; "" is the home tab. */
  segment: string;
  /** Shown only while this area is on in `home.features`; null is always shown. */
  feature: ParticipantFeatureKey | null;
};

export const PARTICIPANT_TABS: readonly ParticipantTab[] = [
  { key: "home", label: "홈", segment: "", feature: null },
  { key: "schedule", label: "일정", segment: "schedule", feature: "schedule" },
  { key: "notices", label: "공지", segment: "notices", feature: "notices" },
  { key: "group", label: "내 조", segment: "group", feature: "groups" },
  { key: "me", label: "내 정보", segment: "me", feature: null },
];

export function participantPath(eventId: string, tab: ParticipantTabKey, ...rest: string[]): string {
  const segment = PARTICIPANT_TABS.find((item) => item.key === tab)?.segment ?? "";
  return ["", "participate", eventId, segment, ...rest].filter((part, index) => index === 0 || part.length > 0).join("/");
}

/** Tabs to show. Before `home` answers (`features` null) only the always-on tabs show. */
export function visibleTabs(features: ParticipantFeatures | null): ParticipantTab[] {
  return PARTICIPANT_TABS.filter((tab) => tab.feature === null || (features?.[tab.feature] ?? false));
}

/** The tab a path under `/participate/{eventId}` belongs to. */
export function tabOfPath(eventId: string, pathname: string): ParticipantTabKey {
  const base = `/participate/${eventId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+/, "") : "";
  const first = rest.split("/")[0] ?? "";
  return PARTICIPANT_TABS.find((tab) => tab.segment === first && first.length > 0)?.key ?? "home";
}
