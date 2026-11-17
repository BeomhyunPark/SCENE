import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiErrorCode } from "../api/errors";
import { deliver, deliveryTiming, isUnanswered } from "./checkInDelivery";

const online = { isOnline: () => true };

function fail(status: number, code: ApiErrorCode) {
  return new ApiError({ status, code });
}

/** A fake server: each call takes the next answer; an Error is thrown, anything else is returned. */
function script(...answers: unknown[]) {
  const keys: string[] = [];
  const send = vi.fn(async (key: string) => {
    keys.push(key);
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return next;
  });
  return { send, keys };
}

describe("check-in delivery (#287)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resends with the same key after a failure and stops at the first answer", async () => {
    const { send, keys } = script(fail(0, "NETWORK_ERROR"), fail(503, "UNEXPECTED"), "ok");
    const delivery = await deliver(send, "key-1", online);
    expect(delivery).toEqual({ kind: "done", value: "ok", key: "key-1" });
    expect(keys).toEqual(["key-1", "key-1", "key-1"]);
  });

  it("waits 1·2·4 s between tries, then reports unconfirmed instead of success", async () => {
    vi.useFakeTimers();
    deliveryTiming.retryDelaysMs = [1000, 2000, 4000];
    const { send, keys } = script(fail(0, "NETWORK_ERROR"));
    const result = deliver(send, "key-1", online);
    await vi.advanceTimersByTimeAsync(0);
    expect(keys).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(keys).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(keys).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(keys).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(4000);
    const delivery = await result;
    expect(delivery.kind).toBe("unconfirmed");
    expect(keys).toEqual(["key-1", "key-1", "key-1", "key-1"]);
  });

  it("counts an attempt with no answer before the timeout as unanswered", async () => {
    vi.useFakeTimers();
    deliveryTiming.retryDelaysMs = [];
    const send = vi.fn(
      (_key: string, signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(fail(0, "NETWORK_ERROR")));
        }),
    );
    const result = deliver(send, "key-1", online);
    await vi.advanceTimersByTimeAsync(deliveryTiming.timeoutMs);
    expect((await result).kind).toBe("unconfirmed");
  });

  it("does not retry a final answer", async () => {
    for (const error of [
      fail(409, "EVENT_ENDED"),
      fail(404, "RESOURCE_NOT_FOUND"),
      fail(403, "FORBIDDEN"),
      fail(409, "INVALID_STATE_TRANSITION"),
      fail(400, "VALIDATION_FAILED"),
    ]) {
      const { send, keys } = script(error);
      expect(await deliver(send, "key-1", online)).toEqual({ kind: "refused", error, key: "key-1" });
      expect(keys).toHaveLength(1);
    }
  });

  it("stops retrying when the event ends meanwhile", async () => {
    const ended = fail(409, "EVENT_ENDED");
    const { send, keys } = script(fail(0, "NETWORK_ERROR"), ended);
    expect(await deliver(send, "key-1", online)).toEqual({ kind: "refused", error: ended, key: "key-1" });
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  it("judges a 409 CONFLICT once more with a fresh key, and only once", async () => {
    const conflict = fail(409, "CONFLICT");
    const once = script(conflict, "ok");
    const delivery = await deliver(once.send, "key-1", online);
    expect(delivery.kind).toBe("done");
    expect(once.keys[0]).toBe("key-1");
    expect(once.keys[1]).not.toBe("key-1");
    expect(delivery.key).toBe(once.keys[1]);

    const twice = script(conflict);
    expect(await deliver(twice.send, "key-1", online)).toMatchObject({ kind: "refused", error: conflict });
    expect(twice.keys).toHaveLength(2);
  });

  it("does not send while offline and stops retrying when the connection drops", async () => {
    const never = script("ok");
    expect(await deliver(never.send, "key-1", { isOnline: () => false })).toEqual({ kind: "offline", key: "key-1" });
    expect(never.send).not.toHaveBeenCalled();

    let up = true;
    const dropped = script(fail(0, "NETWORK_ERROR"));
    dropped.send.mockImplementationOnce(async () => {
      up = false;
      throw fail(0, "NETWORK_ERROR");
    });
    expect(await deliver(dropped.send, "key-1", { isOnline: () => up })).toEqual({ kind: "offline", key: "key-1" });
    expect(dropped.send).toHaveBeenCalledTimes(1);
  });

  it("treats only no-answer failures as unanswered", () => {
    expect(isUnanswered(fail(0, "NETWORK_ERROR"))).toBe(true);
    expect(isUnanswered(fail(200, "UNEXPECTED"))).toBe(true);
    expect(isUnanswered(fail(502, "UNEXPECTED"))).toBe(true);
    expect(isUnanswered(fail(429, "RATE_LIMITED"))).toBe(true);
    expect(isUnanswered(new TypeError("boom"))).toBe(true);
    expect(isUnanswered(fail(409, "CONFLICT"))).toBe(false);
    expect(isUnanswered(fail(409, "EVENT_ENDED"))).toBe(false);
  });
});
