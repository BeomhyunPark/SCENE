import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fieldRefresh, useFieldRefresh, type FieldRefreshOptions } from "./fieldRefresh";

const { intervalMs, quietMs } = fieldRefresh;

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

function setup(overrides: Partial<FieldRefreshOptions> = {}) {
  const readSummary = vi.fn(() => Promise.resolve());
  const readRoster = vi.fn(() => Promise.resolve());
  const initial: FieldRefreshOptions = {
    online: true,
    paused: false,
    rosterHeld: false,
    readSummary,
    readRoster,
    ...overrides,
  };
  const hook = renderHook((props: FieldRefreshOptions) => useFieldRefresh(props), { initialProps: initial });
  const update = (next: Partial<FieldRefreshOptions>) => {
    Object.assign(initial, next);
    hook.rerender({ ...initial });
  };
  return { readSummary, readRoster, update, hook };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("field refresh (#408)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("reads the numbers and the roster every interval while visible and online", () => {
    const { readSummary, readRoster } = setup();
    advance(intervalMs - 1);
    expect(readSummary).not.toHaveBeenCalled();
    advance(1);
    expect(readSummary).toHaveBeenCalledTimes(1);
    expect(readRoster).toHaveBeenCalledTimes(1);
    advance(intervalMs);
    expect(readSummary).toHaveBeenCalledTimes(2);
    expect(readRoster).toHaveBeenCalledTimes(2);
  });

  it("rests while the tab is hidden and reads at once when it is seen again", () => {
    const { readSummary, readRoster } = setup();
    act(() => setVisibility("hidden"));
    advance(intervalMs * 3);
    expect(readSummary).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    expect(readSummary).toHaveBeenCalledTimes(1);
    expect(readRoster).toHaveBeenCalledTimes(1);
  });

  it("rests while offline and while a check-in is being sent", () => {
    const { readSummary, update } = setup({ online: false });
    advance(intervalMs * 2);
    expect(readSummary).not.toHaveBeenCalled();
    update({ online: true, paused: true });
    advance(intervalMs * 2);
    expect(readSummary).not.toHaveBeenCalled();
    update({ paused: false });
    advance(intervalMs);
    expect(readSummary).toHaveBeenCalledTimes(1);
  });

  it("reads only the numbers while the roster is held, then the roster as soon as the hold ends", () => {
    const { readSummary, readRoster, update } = setup({ rosterHeld: true });
    advance(intervalMs * 2);
    expect(readSummary).toHaveBeenCalledTimes(2);
    expect(readRoster).not.toHaveBeenCalled();
    update({ rosterHeld: false });
    expect(readRoster).toHaveBeenCalledTimes(1);
    // Nothing was missed after that read, so releasing again does not read twice.
    update({ rosterHeld: true });
    update({ rosterHeld: false });
    expect(readRoster).toHaveBeenCalledTimes(1);
  });

  it("holds a due roster read briefly after a touch, but not past one more interval", () => {
    const { readSummary, readRoster } = setup();
    advance(intervalMs - 500);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    advance(500);
    expect(readSummary).toHaveBeenCalledTimes(1);
    expect(readRoster).not.toHaveBeenCalled();
    advance(quietMs - 500);
    expect(readRoster).toHaveBeenCalledTimes(1);

    // Touching all the time: the read still happens one interval after it was due.
    const touches = window.setInterval(() => window.dispatchEvent(new Event("scroll")), 500);
    advance(intervalMs * 2 - (quietMs - 500));
    window.clearInterval(touches);
    expect(readRoster).toHaveBeenCalledTimes(2);
  });

  it("새로 고침 reads both at once, even while the roster is held", async () => {
    const { readSummary, readRoster, hook } = setup({ rosterHeld: true });
    await act(() => hook.result.current.refreshNow());
    expect(readSummary).toHaveBeenCalledTimes(1);
    expect(readRoster).toHaveBeenCalledTimes(1);
    expect(hook.result.current.refreshing).toBe(false);
  });
});
