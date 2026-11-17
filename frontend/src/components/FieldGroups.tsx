import { useState } from "react";
import type { RosterItem } from "../api/checkIns";
import { NO_GROUP, pendingFor, type GroupStat } from "./fieldGroupStats";
import { FieldRosterRow } from "./FieldRosterRow";
import { participantLabel } from "./participantLabel";
import type { PendingRequest } from "./useCheckInQueue";

/** How many 미도착 names a closed group shows before "외 n명". */
const MISSING_SHOWN = 5;
/**
 * 조별 현황 (#288, DEC-071·DEC-072): one card per published group with 도착 n / 전체 m, the leaders and the
 * people not arrived. Opening a card lists its members with the same check-in·cancel·retry row as the
 * 전체 list. No dedicated Figma frame; it follows the 현장 운영 rows and chips. Copy is a draft.
 */
export function FieldGroups({
  stats,
  pendingByTarget,
  disabled,
  onCheckIn,
  onCancel,
  onRetry,
}: {
  stats: GroupStat[];
  pendingByTarget: Map<string, PendingRequest>;
  disabled: boolean;
  onCheckIn: (item: RosterItem) => void;
  onCancel: (item: RosterItem) => void;
  onRetry: (request: PendingRequest) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groupsWithMissing = stats.filter((group) => group.key !== NO_GROUP && group.missing.length > 0).length;
  const groupCount = stats.filter((group) => group.key !== NO_GROUP).length;

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <p className="event-field__muted">
        {groupCount.toLocaleString("ko-KR")}개 조 중 {groupsWithMissing.toLocaleString("ko-KR")}개 조에 미도착이 있어요.
      </p>
      <ul className="field-groups" aria-label="조별 체크인 현황">
        {stats.map((group) => {
          const expanded = open.has(group.key);
          const panelId = `field-group-${group.key}`;
          const complete = group.missing.length === 0;
          const shown = group.missing.slice(0, MISSING_SHOWN).map(participantLabel).join(", ");
          const more = group.missing.length - MISSING_SHOWN;
          return (
            <li key={group.key} className="field-groups__group">
              <button
                type="button"
                className="field-groups__head"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(group.key)}
              >
                <span className="field-groups__title">
                  <span className="field-groups__name">{group.name}</span>
                  <span className={complete ? "event-field__badge event-field__badge--done" : "event-field__badge"}>
                    도착 {group.arrived.toLocaleString("ko-KR")} / {group.members.length.toLocaleString("ko-KR")}
                  </span>
                </span>
                {group.leaders.length > 0 ? (
                  <span className="field-groups__line">조장 {group.leaders.join(", ")}</span>
                ) : group.key !== NO_GROUP ? (
                  <span className="field-groups__line">조장 없음</span>
                ) : null}
                <span className={complete ? "field-groups__line" : "field-groups__line field-groups__missing"}>
                  {complete
                    ? "모두 도착했어요"
                    : `미도착 ${shown}${more > 0 ? ` 외 ${more.toLocaleString("ko-KR")}명` : ""}`}
                </span>
                <span className="field-groups__toggle" aria-hidden="true">
                  {expanded ? "접기" : "조원 보기"}
                </span>
              </button>
              {expanded ? (
                <ul className="event-field__list field-groups__members" id={panelId} aria-label={`${group.name} 조원`}>
                  {group.members.map(({ item, leader }) => {
                    const request = pendingFor(item, pendingByTarget);
                    return (
                      <FieldRosterRow
                        key={item.participantId}
                        item={item}
                        note={leader ? "조장" : undefined}
                        disabled={disabled}
                        request={request}
                        onCheckIn={() => onCheckIn(item)}
                        onCancel={() => onCancel(item)}
                        onRetry={() => request && onRetry(request)}
                      />
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
