import { createContext, useContext } from "react";
import type { ParticipantFeatures, ParticipantHome } from "../../api/participantHome";
import type { ParticipantPollState } from "./useParticipantUpdates";

/**
 * What every participant tab and card can read: the event, the areas that are on, the poll state
 * (last update, offline, server clock offset for "지금·다음") and the way out on a lost session.
 */
export type ParticipantFeed = {
  eventId: string;
  name: string;
  home: ParticipantHome | null;
  features: ParticipantFeatures | null;
  poll: ParticipantPollState;
  /** A card got `401`: drop the participant reads and show the sign-in screen. */
  sessionLost: () => void;
};

export const ParticipantFeedContext = createContext<ParticipantFeed | null>(null);

export function useParticipantFeed(): ParticipantFeed {
  const feed = useContext(ParticipantFeedContext);
  if (!feed) throw new Error("useParticipantFeed outside ParticipantShell");
  return feed;
}

/** Phone time corrected by the last `serverTime` (§6). For C5's "지금·다음 일정". */
export function serverNow(feed: Pick<ParticipantFeed, "poll">, phoneNow = Date.now()): number {
  return phoneNow + feed.poll.serverOffsetMs;
}

const clockFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "HH:mm" in Korea time, for "마지막 갱신 HH:mm". */
export function clockText(at: number): string {
  const parts = Object.fromEntries(clockFormat.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}`;
}
