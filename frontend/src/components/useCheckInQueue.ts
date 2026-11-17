import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelCheckIn,
  checkInByQr,
  checkInManually,
  newIdempotencyKey,
  type CancelResult,
  type CheckInResult,
} from "../api/checkIns";
import { isApiError } from "../api/errors";
import { deliver, type Delivery } from "./checkInDelivery";

export type CheckInAction =
  | { kind: "check-in"; mode: "MANUAL"; participantId: string; name: string }
  | { kind: "check-in"; mode: "QR"; code: string }
  | { kind: "cancel"; checkInId: string; participantId: string; name: string; reason: string };

export type ActionDelivery = Delivery<CheckInResult | CancelResult>;

/** "sending": out now or between retries. "offline": waiting for the connection. "unconfirmed": gave up. */
export type PendingPhase = "sending" | "offline" | "unconfirmed";

export type PendingRequest = { target: string; action: CheckInAction; phase: PendingPhase };

type Job = PendingRequest & { key: string; running: Promise<ActionDelivery> | null };

export type Settled = { action: CheckInAction; delivery: ActionDelivery };

/**
 * Check-in and cancel requests for 현장 운영 whose result is not known yet (#287). One entry per target
 * (participant for a manual check-in, QR value for a scan, check-in for a cancel): the same action on the
 * same target reuses its Idempotency-Key until the server answers. Entries live in memory only; closing or
 * reloading the screen drops them, and nothing about a participant is written to browser storage
 * (security-privacy-v0.1 기기 임시 변경). When the browser comes back online every waiting entry is sent
 * again and `onReconnected` runs with what happened, so the page can reload the summary.
 */
export function useCheckInQueue(
  eventId: string,
  callbacks: {
    /** A request got a final answer: summary and roster may have changed. */
    onChanged: () => void;
    onReconnected: (settled: Settled[]) => void;
  },
) {
  const jobs = useRef(new Map<string, Job>());
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const alive = useRef<AbortController | null>(null);
  const latest = useRef(callbacks);
  useEffect(() => {
    latest.current = callbacks;
  });

  const publish = useCallback(() => {
    setPending([...jobs.current.values()].map(({ target, action, phase }) => ({ target, action, phase })));
  }, []);

  const run = useCallback(
    (job: Job): Promise<ActionDelivery> => {
      if (job.running) return job.running;
      job.phase = "sending";
      publish();
      const signal = alive.current?.signal;
      const running = deliver<CheckInResult | CancelResult>((key, attemptSignal) => send(eventId, job.action, key, attemptSignal), job.key, {
        isOnline: () => navigator.onLine,
        signal,
      }).then((delivery) => {
        job.running = null;
        if (signal?.aborted) return delivery;
        job.key = delivery.key;
        if (delivery.kind === "done" || delivery.kind === "refused") {
          jobs.current.delete(job.target);
          // The event left ACTIVE: nothing still waiting can succeed, so it is dropped with this answer.
          if (delivery.kind === "refused" && isEventBlocked(delivery.error)) {
            for (const [target, other] of jobs.current) if (!other.running) jobs.current.delete(target);
          }
          latest.current.onChanged();
        } else {
          job.phase = delivery.kind;
        }
        publish();
        return delivery;
      });
      job.running = running;
      return running;
    },
    [eventId, publish],
  );

  const submit = useCallback(
    (action: CheckInAction): Promise<ActionDelivery> => {
      const target = targetOf(action);
      let job = jobs.current.get(target);
      if (!job || !sameAction(job.action, action)) {
        if (job?.running) return job.running;
        job = { target, action, phase: "sending", key: newIdempotencyKey(), running: null };
        jobs.current.set(target, job);
      }
      return run(job);
    },
    [run],
  );

  const retry = useCallback(
    (target: string): Promise<ActionDelivery> | null => {
      const job = jobs.current.get(target);
      return job ? run(job) : null;
    },
    [run],
  );

  useEffect(() => {
    const controller = new AbortController();
    alive.current = controller;
    const onOnline = () => {
      setOnline(true);
      const waiting = [...jobs.current.values()];
      void Promise.all(waiting.map((job) => run(job).then((delivery) => ({ action: job.action, delivery })))).then(
        (settled) => {
          if (!controller.signal.aborted) latest.current.onReconnected(settled);
        },
      );
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      controller.abort();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [run]);

  // Leaving the page drops what is not confirmed, so the browser asks first.
  const waiting = pending.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [waiting]);

  return { pending, online, submit, retry };
}

export function targetOf(action: CheckInAction): string {
  if (action.kind === "cancel") return `cancel:${action.checkInId}`;
  return action.mode === "QR" ? `qr:${action.code}` : `participant:${action.participantId}`;
}

export function isEventBlocked(error: unknown): boolean {
  if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) return true;
  return isApiError(error, "INVALID_STATE_TRANSITION") && error.extensions.reason !== "APPLICATION_NOT_SUBMITTED";
}

function sameAction(a: CheckInAction, b: CheckInAction): boolean {
  return a.kind === b.kind && (a.kind !== "cancel" || b.kind !== "cancel" || a.reason.trim() === b.reason.trim());
}

function send(
  eventId: string,
  action: CheckInAction,
  key: string,
  signal: AbortSignal,
): Promise<CheckInResult | CancelResult> {
  if (action.kind === "cancel") return cancelCheckIn(eventId, action.checkInId, { reason: action.reason }, key, signal);
  if (action.mode === "QR") return checkInByQr(eventId, action.code, key, signal);
  return checkInManually(eventId, action.participantId, key, signal);
}
