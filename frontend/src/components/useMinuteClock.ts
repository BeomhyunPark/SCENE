import { useEffect, useState } from "react";

/**
 * The time for the 시간표's current-time line (#466). It wakes on each new minute (schedule times are whole
 * minutes, so nothing on screen changes in between), stops while the tab is hidden and catches up as soon
 * as it is shown again. `offsetMs` corrects the phone clock with the server's (participant §6).
 */
export function useMinuteClock(offsetMs = 0, enabled = true): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const tick = () => {
      window.clearTimeout(timer);
      timer = undefined;
      const current = Date.now() + offsetMs;
      setNow(current);
      if (document.hidden) return;
      timer = window.setTimeout(tick, 60_000 - (current % 60_000) + 50);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = undefined;
      } else {
        tick();
      }
    };
    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [offsetMs, enabled]);
  return now;
}
