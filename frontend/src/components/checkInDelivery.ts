import { newIdempotencyKey } from "../api/checkIns";
import { isApiError } from "../api/errors";

/**
 * Sending one check-in or cancel over a weak connection (#287, DEC-071 "범위 밖": no offline queue, short
 * retries with the same Idempotency-Key). One operator action keeps one key, so a resend after a lost
 * response is a replay on the server, not a second check-in (backend/docs/api.md "같은 Idempotency-Key").
 *
 * - No answer (network error, timeout, 5xx, 408, 429, or a 200 that could not be read): resend with the same
 *   key after each of `retryDelaysMs`, then report "unconfirmed" and leave the next try to the operator.
 * - Offline before an attempt: stop and report "offline"; the caller resends when the browser is back online.
 * - 409 CONFLICT (the key was already used for another target or action): one fresh key, judged once more.
 * - Any other answer from the server is final ("refused"), including 409 EVENT_ENDED, which stops retries.
 *
 * Nothing here is stored: the key lives only as long as the caller keeps it in memory.
 */
export const deliveryTiming = {
  retryDelaysMs: [1000, 2000, 4000] as readonly number[],
  /** An attempt with no answer by then is aborted and counted as unanswered. */
  timeoutMs: 10_000,
};

export type Delivery<T> =
  | { kind: "done"; value: T; key: string }
  | { kind: "refused"; error: unknown; key: string }
  | { kind: "unconfirmed"; error: unknown; key: string }
  | { kind: "offline"; key: string };

export type DeliveryHooks = {
  isOnline: () => boolean;
  /** Before each send; `attempt` is 0 for the first. */
  onAttempt?: (attempt: number) => void;
  /** Stops waiting between retries (the screen closed). */
  signal?: AbortSignal;
};

export function isUnanswered(error: unknown): boolean {
  if (!isApiError(error)) return true;
  if (error.code === "NETWORK_ERROR" || error.code === "UNEXPECTED") return true;
  return error.status >= 500 || error.status === 408 || error.status === 429;
}

export async function deliver<T>(
  send: (key: string, signal: AbortSignal) => Promise<T>,
  firstKey: string,
  hooks: DeliveryHooks,
): Promise<Delivery<T>> {
  let key = firstKey;
  let renewed = false;
  let retries = 0;
  let attempt = 0;
  for (;;) {
    if (!hooks.isOnline()) return { kind: "offline", key };
    hooks.onAttempt?.(attempt);
    attempt += 1;
    try {
      return { kind: "done", value: await withTimeout((signal) => send(key, signal)), key };
    } catch (error) {
      if (isApiError(error, "CONFLICT") && !renewed) {
        renewed = true;
        key = newIdempotencyKey();
        continue;
      }
      if (!isUnanswered(error)) return { kind: "refused", error, key };
      if (!hooks.isOnline()) return { kind: "offline", key };
      const delay = deliveryTiming.retryDelaysMs[retries];
      if (delay === undefined || hooks.signal?.aborted) return { kind: "unconfirmed", error, key };
      retries += 1;
      await sleep(delay, hooks.signal);
      if (hooks.signal?.aborted) return { kind: "unconfirmed", error, key };
    }
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deliveryTiming.timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
  });
}
