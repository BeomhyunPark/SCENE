import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isApiError } from "../../api/errors";
import { DEFAULT_POLL_SECONDS, getParticipantUpdates, type ParticipantUpdates } from "../../api/participantHome";
import { changedTargets } from "./updateTargets";

export const MAX_POLL_SECONDS = 300;
const JITTER = 0.2;

export type ParticipantPollState = {
  /** Phone time (ms) of the last good `updates` answer, or of the `home` read that carried one. */
  lastSuccessAt: number | null;
  /** The browser said `offline`; checks stop until `online`. */
  offline: boolean;
  /** The last check failed (network or 5xx); the next one waits twice as long, up to 300 s. */
  failing: boolean;
  /** `serverTime` − phone time when it was received (§6). 0 until the first answer with a time. */
  serverOffsetMs: number;
  /** Unread notifications for the B5 bell; null until the server sends `notifications`. */
  unreadCount: number | null;
};

type Options = {
  eventId: string;
  /**
   * The `updates` object inside `home`, read once at mount; the first check then waits a period
   * instead of running now. Mount the hook after `home` has loaded.
   */
  initial: ParticipantUpdates | null;
  enabled: boolean;
  /** `401` (or a temporary-number session): stop and send the person back to the sign-in screen. */
  onSessionLost: () => void;
  /** Test seams. */
  fetchUpdates?: (signal: AbortSignal) => Promise<ParticipantUpdates>;
  random?: () => number;
};

/**
 * The participant poll (DEC-080 §5, participant-home-contract §5). While the page is visible it reads
 * `updates` every `pollAfterSeconds` ±20%, and reloads only the reads whose value differs
 * (`updateTargets.ts`). Hidden: no timer is left. Visible again or `online`: one check at once, then
 * the period again. A failed check doubles the wait (max 300 s) until one succeeds. `401` stops it.
 * Card queries do not refetch on focus themselves, so focus never reads the same path twice.
 */
export function useParticipantUpdates({
  eventId,
  initial,
  enabled,
  onSessionLost,
  fetchUpdates = getParticipantUpdates,
  random = Math.random,
}: Options): ParticipantPollState {
  const queryClient = useQueryClient();
  const baseline = useRef<ParticipantUpdates | null>(initial);
  const callbacks = useRef({ onSessionLost, fetchUpdates, random });
  useEffect(() => {
    callbacks.current = { onSessionLost, fetchUpdates, random };
  });
  const [state, setState] = useState<ParticipantPollState>(() => ({
    lastSuccessAt: initial ? Date.now() : null,
    offline: typeof navigator !== "undefined" && navigator.onLine === false,
    failing: false,
    serverOffsetMs: offsetOf(initial),
    unreadCount: initial?.notifications?.unreadCount ?? null,
  }));

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let running = false;
    let controller: AbortController | null = null;
    let pollSeconds = baseline.current?.pollAfterSeconds ?? DEFAULT_POLL_SECONDS;
    let failures = 0;

    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const canRun = () => !stopped && document.visibilityState !== "hidden" && navigator.onLine !== false;
    const schedule = () => {
      clear();
      if (!canRun()) return;
      const base = Math.min(MAX_POLL_SECONDS, pollSeconds * 2 ** failures);
      const seconds = Math.min(MAX_POLL_SECONDS, base * (1 - JITTER + callbacks.current.random() * JITTER * 2));
      timer = setTimeout(() => void run(), seconds * 1000);
    };
    const run = async () => {
      clear();
      if (!canRun() || running) return;
      running = true;
      controller = new AbortController();
      try {
        const next = await callbacks.current.fetchUpdates(controller.signal);
        if (stopped) return;
        const before = baseline.current;
        baseline.current = next;
        if (before) {
          for (const queryKey of changedTargets(eventId, before, next)) void queryClient.invalidateQueries({ queryKey });
        }
        pollSeconds = next.pollAfterSeconds;
        failures = 0;
        setState((current) => ({
          ...current,
          lastSuccessAt: Date.now(),
          failing: false,
          serverOffsetMs: next.serverTime ? offsetOf(next) : current.serverOffsetMs,
          unreadCount: next.notifications?.unreadCount ?? current.unreadCount,
        }));
      } catch (error) {
        if (stopped) return;
        if (isApiError(error, "AUTHENTICATION_REQUIRED", "PARTICIPANT_PIN_CHANGE_REQUIRED")) {
          stopped = true;
          clear();
          callbacks.current.onSessionLost();
          return;
        }
        failures += 1;
        setState((current) => (current.failing ? current : { ...current, failing: true }));
      } finally {
        running = false;
        controller = null;
      }
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") clear();
      else void run();
    };
    const onOffline = () => {
      clear();
      setState((current) => ({ ...current, offline: true }));
    };
    const onOnline = () => {
      setState((current) => ({ ...current, offline: false }));
      void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (baseline.current) schedule();
    else void run();

    return () => {
      stopped = true;
      clear();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, eventId, queryClient]);

  return state;
}

function offsetOf(updates: ParticipantUpdates | null): number {
  if (!updates?.serverTime) return 0;
  const server = Date.parse(updates.serverTime);
  return Number.isNaN(server) ? 0 : server - Date.now();
}
