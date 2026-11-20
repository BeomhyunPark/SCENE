import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getParticipantSchedule } from "../../api/participantSchedule";
import { queryKeys } from "../../api/queryKeys";
import type { ScheduleDay } from "../../api/schedule";
import { serverNow, useParticipantFeed } from "./participantFeed";
import { nextBoundaryMs, type TimedItem } from "./scheduleNow";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

/**
 * The 일정 read shared by the home card and the 일정 tab: one request, one cache entry. It reloads only
 * when `updates.schedule` (or `updates.group`, which can change leader-only items) changes; the screen
 * never polls this path itself (200 people on one Wi-Fi).
 */
export function useParticipantScheduleQuery(eventId: string) {
  const query = useQuery({
    queryKey: queryKeys.participantSchedule(eventId),
    queryFn: ({ signal }) => getParticipantSchedule(signal),
    ...participantCardQuery,
  });
  useSessionGuard(query.error);
  return query;
}

/** Longest sleep between recomputes, so a phone waking from sleep catches up soon. */
const MAX_SLEEP_MS = 60_000;

/**
 * The corrected clock (§6) for 지금·다음, re-read on the phone's own timer at the next start or end
 * (at most a minute apart). It calls no server.
 */
export function useScheduleClock(items: readonly TimedItem[], days: readonly ScheduleDay[]): number {
  const feed = useParticipantFeed();
  const [now, setNow] = useState(() => serverNow(feed));
  const offset = feed.poll.serverOffsetMs;
  useEffect(() => {
    const current = Date.now() + offset;
    // A new answer can move the offset; catch up at once instead of at the next boundary.
    const stale = Math.abs(current - now) > 1000;
    const boundary = nextBoundaryMs(items, current, days);
    const wait = stale ? 0 : boundary === null ? MAX_SLEEP_MS : Math.min(Math.max(boundary - current, 0) + 50, MAX_SLEEP_MS);
    const timer = window.setTimeout(() => setNow(Date.now() + offset), wait);
    return () => window.clearTimeout(timer);
  }, [items, days, offset, now]);
  return now;
}
