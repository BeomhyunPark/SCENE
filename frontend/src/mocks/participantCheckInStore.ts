import { checkInCodeFor, readRoster } from "./checkInStore";
import { localUsers } from "./fixtures/seed";
import { eventById } from "./operatorStore";

/**
 * Shaped like ParticipantCheckInController (#283). The value comes from the operator mock's
 * `checkInCodeFor` (#286), so the operator mock scan reads exactly what this screen shows.
 */
let hasSecret = true;

export function resetParticipantCheckInStore(): void {
  hasSecret = true;
}

/** Test seam: an empty SCENE_CHECKIN_CODE_SECRET, which makes AVAILABLE a 404. */
export function setParticipantCheckInSecret(next: string | null): void {
  hasSecret = Boolean(next);
}

export type ParticipantCheckInResult =
  | { status: "AVAILABLE" | "NOT_STARTED" | "ENDED" | "NOT_ELIGIBLE"; code: string | null; checkedIn: boolean; checkedInAt: string | null }
  | { failure: { status: number; code: string } };

export async function readParticipantCheckIn(eventId: string, participantId: string): Promise<ParticipantCheckInResult> {
  const event = eventById(eventId);
  if (!event) return { failure: { status: 404, code: "RESOURCE_NOT_FOUND" } };
  const row = rosterRow(eventId, participantId);
  const checkedIn = row?.checkIn?.status === "CHECKED_IN";
  const arrival = { checkedIn, checkedInAt: checkedIn ? row!.checkIn!.checkedInAt : null };
  const lifecycle = String(event.lifecycleStatus);
  if (lifecycle === "DRAFT") return { status: "NOT_STARTED", code: null, ...arrival };
  if (lifecycle === "ENDED" || lifecycle === "ARCHIVED") return { status: "ENDED", code: null, ...arrival };
  if (!row) return { status: "NOT_ELIGIBLE", code: null, ...arrival };
  if (!hasSecret) return { failure: { status: 404, code: "RESOURCE_NOT_FOUND" } };
  return { status: "AVAILABLE", code: checkInCodeFor(eventId, participantId), ...arrival };
}

function rosterRow(eventId: string, participantId: string) {
  for (const user of localUsers) {
    const page = readRoster(eventId, user.userId, new URL("http://mock/?size=100"));
    if ("items" in page) return page.items.find((item) => item.participantId === participantId) ?? null;
  }
  return null;
}
