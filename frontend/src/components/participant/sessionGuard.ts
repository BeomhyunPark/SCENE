import { useContext, useEffect } from "react";
import { isApiError } from "../../api/errors";
import { ParticipantFeedContext } from "./participantFeed";

/**
 * A participant read that answers `401` (session ended, logged out elsewhere, number reset) or
 * `403 PARTICIPANT_PIN_CHANGE_REQUIRED` sends the person back to the gate. Outside the participant
 * shell it does nothing, so a card can be rendered on its own in tests.
 */
export function useSessionGuard(error: unknown): void {
  const feed = useContext(ParticipantFeedContext);
  const lost = isApiError(error, "AUTHENTICATION_REQUIRED", "PARTICIPANT_PIN_CHANGE_REQUIRED");
  const sessionLost = feed?.sessionLost;
  useEffect(() => {
    if (lost && sessionLost) sessionLost();
  }, [lost, sessionLost]);
}
