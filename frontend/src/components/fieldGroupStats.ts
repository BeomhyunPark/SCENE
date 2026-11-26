import type { RosterItem } from "../api/checkIns";
import type { PublishedGroups } from "../api/groups";
import { fieldState } from "./fieldState";
import { participantLabel } from "./participantLabel";
import { targetOf, type PendingRequest } from "./useCheckInQueue";

export const NO_GROUP = "__none__";

export type GroupStat = {
  key: string;
  name: string;
  /** "94 박범현" for each leader, from the publication. */
  leaders: string[];
  members: { item: RosterItem; leader: boolean }[];
  arrived: number;
  /** 미도착: not checked in and not 도착 예정 (fieldState.ts). */
  missing: RosterItem[];
  /** 도착 예정: not checked in, due later. */
  expected: number;
};

/**
 * Joins the latest publication with the check-in roster by participantId (#288). Only roster people are
 * counted (active applications); anyone on the roster outside every published group is "조 없음".
 * Groups with someone missing come first, keeping the published order within each part; "조 없음" is last.
 */
export function buildGroupStats(published: PublishedGroups, roster: RosterItem[]): GroupStat[] {
  const byId = new Map(roster.map((item) => [item.participantId, item]));
  const placed = new Set<string>();
  const stats: GroupStat[] = published.groups.map((group) => {
    const members = group.members.flatMap((member) => {
      const item = byId.get(member.participantId);
      if (!item || placed.has(item.participantId)) return [];
      placed.add(item.participantId);
      return [{ item, leader: member.leader }];
    });
    return stat(
      group.groupId,
      group.name,
      group.members.filter((member) => member.leader).map(participantLabel),
      members,
    );
  });
  const ordered = [
    ...stats.filter((group) => group.missing.length > 0),
    ...stats.filter((group) => group.missing.length === 0),
  ];
  const rest = roster.filter((item) => !placed.has(item.participantId)).map((item) => ({ item, leader: false }));
  if (rest.length > 0) ordered.push(stat(NO_GROUP, "조 없음", [], rest));
  return ordered;
}

/** participantId → published group name; null when the person is in no published group. */
export function publishedGroupNames(published: PublishedGroups): Map<string, string> {
  const names = new Map<string, string>();
  for (const group of published.groups) for (const member of group.members) names.set(member.participantId, group.name);
  return names;
}

function stat(key: string, name: string, leaders: string[], members: GroupStat["members"]): GroupStat {
  const missing = members.filter(({ item }) => fieldState(item) === "absent").map(({ item }) => item);
  const expected = members.filter(({ item }) => fieldState(item) === "expected").length;
  return {
    key,
    name,
    leaders,
    members,
    arrived: members.length - missing.length - expected,
    missing,
    expected,
  };
}

export function pendingFor(item: RosterItem, byTarget: Map<string, PendingRequest>): PendingRequest | undefined {
  const manual = byTarget.get(
    targetOf({
      kind: "check-in",
      mode: "MANUAL",
      participantId: item.participantId,
      name: "",
    }),
  );
  if (manual) return manual;
  if (!item.checkIn) return undefined;
  return byTarget.get(
    targetOf({
      kind: "cancel",
      checkInId: item.checkIn.checkInId,
      participantId: item.participantId,
      name: "",
      reason: "",
    }),
  );
}
