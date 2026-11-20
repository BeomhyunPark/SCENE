import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { parseUpdates, type ParticipantUpdates } from "../../api/participantHome";
import { queryKeys } from "../../api/queryKeys";
import { changedTargets } from "./updateTargets";
import { useParticipantUpdates } from "./useParticipantUpdates";

const EVENT = "event-1";

function updates(values: Record<string, unknown> = {}): ParticipantUpdates {
  const parsed = parseUpdates({
    home: 1,
    schedule: 0,
    notices: 0,
    group: 0,
    rooms: 0,
    mealOrder: 0,
    checkIn: 0,
    application: 1,
    notifications: { latestSeq: 0, unreadCount: 0 },
    pollAfterSeconds: 30,
    serverTime: "2027-01-22T05:30:12Z",
    ...values,
  });
  if (!parsed) throw new Error("updates");
  return parsed;
}

let visibility: DocumentVisibilityState = "visible";
let online = true;

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

function setOnline(next: boolean) {
  online = next;
  window.dispatchEvent(new Event(next ? "online" : "offline"));
}

function setup(options: { initial?: ParticipantUpdates | null; random?: number; answers?: (() => Promise<ParticipantUpdates>)[] } = {}) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
  const queue = [...(options.answers ?? [])];
  const fetchUpdates = vi.fn(() => (queue.shift() ?? (() => Promise.resolve(updates())))());
  const onSessionLost = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(
    () =>
      useParticipantUpdates({
        eventId: EVENT,
        initial: options.initial === undefined ? updates() : options.initial,
        enabled: true,
        onSessionLost,
        fetchUpdates,
        random: () => options.random ?? 0.5,
      }),
    { wrapper },
  );
  return { hook, fetchUpdates, invalidate, onSessionLost };
}

/** Moves fake time and lets the answered fetch settle. */
async function advance(seconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  });
}

function invalidatedKeys(invalidate: ReturnType<typeof vi.spyOn>) {
  return invalidate.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: unknown }).queryKey);
}

describe("participant poll (contract §5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    online = true;
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts from the updates inside home and checks after pollAfterSeconds", async () => {
    const { fetchUpdates } = setup();
    expect(fetchUpdates).not.toHaveBeenCalled();
    await advance(29.9);
    expect(fetchUpdates).not.toHaveBeenCalled();
    await advance(0.2);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
    await advance(30);
    expect(fetchUpdates).toHaveBeenCalledTimes(2);
  });

  it.each([
    [0, 24],
    [1, 36],
  ])("spreads the period by ±20%% (random %s → %s s)", async (random, seconds) => {
    const { fetchUpdates } = setup({ random });
    await advance(seconds - 0.1);
    expect(fetchUpdates).not.toHaveBeenCalled();
    await advance(0.2);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
  });

  it("follows the server's pollAfterSeconds", async () => {
    const { fetchUpdates } = setup({ answers: [() => Promise.resolve(updates({ pollAfterSeconds: 60 }))] });
    await advance(30);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
    await advance(59);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchUpdates).toHaveBeenCalledTimes(2);
  });

  it("checks at once without home's updates", async () => {
    const { fetchUpdates } = setup({ initial: null });
    await advance(0);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
  });

  it("stops while hidden without leaving a timer, and checks at once when visible again", async () => {
    const { fetchUpdates } = setup();
    act(() => setVisibility("hidden"));
    expect(vi.getTimerCount()).toBe(0);
    await advance(600);
    expect(fetchUpdates).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    await advance(0);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
    await advance(30);
    expect(fetchUpdates).toHaveBeenCalledTimes(2);
  });

  it("stops offline and shows it, then checks at once online", async () => {
    const { hook, fetchUpdates } = setup();
    act(() => setOnline(false));
    expect(hook.result.current.offline).toBe(true);
    expect(hook.result.current.lastSuccessAt).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await advance(600);
    expect(fetchUpdates).not.toHaveBeenCalled();
    act(() => setOnline(true));
    await advance(0);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
    expect(hook.result.current.offline).toBe(false);
  });

  it("doubles the wait after each failure up to 300 s and goes back after a success", async () => {
    const fail = () => Promise.reject(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    const serverError = () => Promise.reject(new ApiError({ status: 503, code: "UNEXPECTED" }));
    const { hook, fetchUpdates } = setup({ answers: [fail, serverError, fail, fail, fail] });
    const before = hook.result.current.lastSuccessAt;
    await advance(30);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
    expect(hook.result.current.failing).toBe(true);
    expect(hook.result.current.lastSuccessAt).toBe(before);
    for (const [wait, count] of [
      [60, 2],
      [120, 3],
      [240, 4],
      [300, 5],
      [300, 6],
    ]) {
      await advance(wait - 0.1);
      expect(fetchUpdates).toHaveBeenCalledTimes(count - 1);
      await advance(0.1);
      expect(fetchUpdates).toHaveBeenCalledTimes(count);
    }
    expect(hook.result.current.failing).toBe(false);
    await advance(30);
    expect(fetchUpdates).toHaveBeenCalledTimes(7);
  });

  it("stops and sends the person to sign in on 401", async () => {
    const { fetchUpdates, onSessionLost } = setup({
      answers: [() => Promise.reject(new ApiError({ status: 401, code: "AUTHENTICATION_REQUIRED" }))],
    });
    await advance(30);
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await advance(600);
    expect(fetchUpdates).toHaveBeenCalledTimes(1);
  });

  it("reloads only the keys whose value differs", async () => {
    const { invalidate } = setup({
      answers: [
        () => Promise.resolve(updates()),
        () => Promise.resolve(updates({ checkIn: 1 })),
        // Smaller counts as changed too: values are compared, not ordered.
        () => Promise.resolve(updates({ checkIn: 1, application: 0 })),
      ],
    });
    await advance(30);
    expect(invalidate).not.toHaveBeenCalled();
    await advance(30);
    expect(invalidatedKeys(invalidate)).toEqual([queryKeys.participantCheckIn(EVENT)]);
    invalidate.mockClear();
    await advance(30);
    expect(invalidatedKeys(invalidate)).toEqual([queryKeys.participantApplication(EVENT)]);
  });

  it("reloads notices and schedule with the group", async () => {
    const { invalidate } = setup({ answers: [() => Promise.resolve(updates({ group: 3 }))] });
    await advance(30);
    expect(invalidatedKeys(invalidate)).toEqual([
      queryKeys.participantGroup(EVENT),
      queryKeys.participantNotices(EVENT),
      queryKeys.participantSchedule(EVENT),
    ]);
  });

  it("keeps the server clock offset from serverTime", async () => {
    vi.setSystemTime(new Date("2027-01-22T05:30:00Z"));
    const { hook } = setup({ answers: [() => Promise.resolve(updates({ serverTime: "2027-01-22T05:31:30Z" }))] });
    await advance(30);
    // Server says 05:31:30 when the phone says 05:30:30.
    expect(hook.result.current.serverOffsetMs).toBe(60_000);
  });
});

describe("changedTargets", () => {
  it("ignores keys it does not know or that one side lacks", () => {
    const before = updates();
    const after = parseUpdates({ ...before.versions, futureCard: 9, pollAfterSeconds: 30 })!;
    expect(changedTargets(EVENT, before, after)).toEqual([]);
    const missing = parseUpdates({ home: 1, pollAfterSeconds: 30 })!;
    expect(changedTargets(EVENT, before, missing)).toEqual([]);
  });

  it("names each read once and reloads the bell on a new notification", () => {
    const after = updates({ group: 1, notices: 1, notifications: { latestSeq: 4, unreadCount: 1 } });
    expect(changedTargets(EVENT, updates(), after)).toEqual([
      queryKeys.participantNotices(EVENT),
      queryKeys.participantGroup(EVENT),
      queryKeys.participantSchedule(EVENT),
      queryKeys.participantNotifications(EVENT),
    ]);
  });
});
