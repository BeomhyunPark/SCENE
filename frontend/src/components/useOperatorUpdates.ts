import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import { getOperatorUpdates, type OperatorUpdates } from "../api/operatorNotifications";
import { queryKeys } from "../api/queryKeys";

/** Longest wait after repeated failures (DEC-080 §5, the participant rule). */
export const MAX_DELAY_MS = 300_000;
const FALLBACK_SECONDS = 15;

/**
 * The wait before the next check: `pollAfterSeconds` doubled per failure in a row (up to 300s),
 * then ±20% at random so open screens do not call at the same second (DEC-080 §5).
 */
export function nextDelayMs(pollAfterSeconds: number, failures: number, random: () => number = Math.random): number {
  const base = Math.max(1, pollAfterSeconds) * 1000 * 2 ** Math.min(Math.max(0, failures), 10);
  return Math.round(Math.min(base, MAX_DELAY_MS) * (0.8 + 0.4 * random()));
}

/** The operator's own values for one event, from the cache the polling loop fills. */
export function useOperatorUpdatesValue(eventId: string | undefined): OperatorUpdates | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.operatorUpdates(eventId ?? ""),
    queryFn: ({ signal }) => getOperatorUpdates(eventId!, signal),
    enabled: false,
  });
  return eventId ? data : undefined;
}

/**
 * Operator screen refresh check (#436, DEC-080 §7.5): while the page is visible it reads `updates`
 * at about `pollAfterSeconds` (±20%), stops while hidden, reads at once when shown again, and
 * doubles the wait on failure. 401, 403 and 404 stop it (not an operator of this event). When
 * `notifications.latestSeq` changes, the notification list is read again. Nothing is kept outside
 * the query cache; the field screen's own 10-second refresh (#417) is separate.
 */
export function useOperatorUpdatesPolling(eventId: string | undefined): void {
  const queryClient = useQueryClient();
  const data = useOperatorUpdatesValue(eventId);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let timer: number | undefined;
    let failures = 0;
    let stopped = false;
    let pollSeconds = queryClient.getQueryData<OperatorUpdates>(queryKeys.operatorUpdates(eventId))?.pollAfterSeconds ?? FALLBACK_SECONDS;

    const clear = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clear();
      if (stopped || document.visibilityState === "hidden") return;
      timer = window.setTimeout(() => void tick(0), nextDelayMs(pollSeconds, failures));
    };
    const tick = async (staleTime: number) => {
      clear();
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const value = await queryClient.fetchQuery({
          queryKey: queryKeys.operatorUpdates(eventId),
          queryFn: ({ signal }) => getOperatorUpdates(eventId, signal),
          staleTime,
          retry: false,
        });
        pollSeconds = value.pollAfterSeconds;
        failures = 0;
      } catch (error) {
        if (isApiError(error) && [401, 403, 404].includes(error.status)) {
          stopped = true;
          return;
        }
        failures += 1;
      }
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick(0);
      else clear();
    };
    // A page change mounts a new shell; a value read in the last few seconds is enough to start.
    void tick(5_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [eventId, queryClient]);

  const latestSeq = data?.notifications.latestSeq;
  useEffect(() => {
    if (!eventId || latestSeq === undefined) return;
    if (seen.current !== null && seen.current !== latestSeq) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatorNotifications(eventId) });
    }
    seen.current = latestSeq;
  }, [eventId, latestSeq, queryClient]);
}
