import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How 현장 운영 keeps itself fresh (#408, roadmap E1). Change the numbers here after the load check (J6).
 *
 * - Every `intervalMs` while the page is visible and online, the summary and the roster on screen are read
 *   again. A hidden tab or an offline browser reads nothing; coming back to the tab reads at once.
 * - While a check-in or cancel is being sent nothing is read: its answer reloads both anyway.
 * - While the operator types a search, has the cancel dialog open or is scanning a QR, only the numbers are
 *   read; the roster waits until that ends and is then read at once if a read was missed.
 * - A touch, key or scroll on the page holds a due roster read for `quietMs`, so a row does not move under a
 *   finger. The hold never pushes a read more than `intervalMs` past when it was due.
 *
 * Load (#408): 200 participants, 2 desks. One read is the summary plus the roster pages already loaded
 * (1–4 pages of 50, or 2 of 100 for 조별): at most about 1 request per second for both desks, each a small
 * indexed query over at most 200 rows and about 40 KB. A change marker that skips unchanged rosters is the
 * next step if J6 shows strain.
 */
export const fieldRefresh = {
  intervalMs: 10_000,
  quietMs: 2_000,
};

export type FieldRefreshOptions = {
  online: boolean;
  /** A request is out: read nothing. */
  paused: boolean;
  /** Typing, cancelling or scanning: read the numbers, not the roster. */
  rosterHeld: boolean;
  readSummary: () => Promise<unknown>;
  readRoster: () => Promise<unknown>;
};

export function useFieldRefresh(options: FieldRefreshOptions): { refreshNow: () => Promise<void>; refreshing: boolean } {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const lastActivity = useRef(0);
  /** When a roster read became due and was held, or null. */
  const rosterDueAt = useRef<number | null>(null);
  const quietTimer = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const clearQuietTimer = () => {
    if (quietTimer.current !== null) window.clearTimeout(quietTimer.current);
    quietTimer.current = null;
  };

  const tryRoster = useCallback(function tryRosterRead() {
    const current = latest.current;
    const dueAt = rosterDueAt.current;
    if (dueAt === null || current.rosterHeld || current.paused || !current.online || isHidden()) return;
    const now = Date.now();
    const quietAt = lastActivity.current + fieldRefresh.quietMs;
    if (now < quietAt && now - dueAt < fieldRefresh.intervalMs) {
      clearQuietTimer();
      quietTimer.current = window.setTimeout(tryRosterRead, Math.min(quietAt, dueAt + fieldRefresh.intervalMs) - now);
      return;
    }
    clearQuietTimer();
    rosterDueAt.current = null;
    void current.readRoster().catch(() => {});
  }, []);

  const tick = useCallback(() => {
    const current = latest.current;
    if (current.paused || !current.online || isHidden()) return;
    void current.readSummary().catch(() => {});
    rosterDueAt.current ??= Date.now();
    tryRoster();
  }, [tryRoster]);

  // The interval, restarted whenever reading becomes possible again.
  const { online, paused, rosterHeld } = options;
  useEffect(() => {
    if (!online || paused) return;
    const timer = window.setInterval(tick, fieldRefresh.intervalMs);
    return () => window.clearInterval(timer);
  }, [online, paused, tick]);

  // A held or paused roster read runs as soon as the hold ends.
  useEffect(() => {
    if (!rosterHeld && !paused && online) tryRoster();
  }, [rosterHeld, paused, online, tryRoster]);

  useEffect(() => {
    const onVisibility = () => {
      if (!isHidden()) tick();
    };
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    for (const type of ACTIVITY) window.addEventListener(type, onActivity, { capture: true, passive: true });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const type of ACTIVITY) window.removeEventListener(type, onActivity, { capture: true });
      clearQuietTimer();
    };
  }, [tick]);

  const refreshNow = useCallback(async () => {
    const current = latest.current;
    clearQuietTimer();
    rosterDueAt.current = null;
    setRefreshing(true);
    try {
      await Promise.all([current.readSummary(), current.readRoster()].map((read) => read.catch(() => {})));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { refreshNow, refreshing };
}

const ACTIVITY = ["pointerdown", "keydown", "scroll", "touchmove"] as const;

function isHidden(): boolean {
  return document.visibilityState === "hidden";
}
