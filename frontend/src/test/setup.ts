import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../mocks/server";
import { resetOperatorSession } from "../mocks/handlers/session";
import { resetFormStore } from "../mocks/formStore";
import { resetInvitationStore } from "../mocks/invitationStore";
import { resetOperatorStore } from "../mocks/operatorStore";
import { resetParticipantStore } from "../mocks/participantStore";
import { resetParticipantCheckInStore } from "../mocks/participantCheckInStore";
import { resetParticipantGroupStore } from "../mocks/participantGroupStore";
import { resetRetrospectiveStore } from "../mocks/retrospectiveStore";
import { resetAccessKeyCapture } from "../accessKey";
import { resetCheckInStore } from "../mocks/checkInStore";
import { resetTaskStore } from "../mocks/taskStore";
import { deliveryTiming } from "../components/checkInDelivery";

/** Check-in retries (#287) wait 1·2·4 s in the app; tests that want real waits set their own. */
const TEST_RETRY_DELAYS_MS = [1, 1, 1];

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  deliveryTiming.retryDelaysMs = TEST_RETRY_DELAYS_MS;
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetOperatorSession();
  resetOperatorStore();
  resetTaskStore();
  resetRetrospectiveStore();
  resetCheckInStore();
  resetParticipantStore();
  resetParticipantCheckInStore();
  resetParticipantGroupStore();
  resetAccessKeyCapture();
  resetFormStore();
  resetInvitationStore();
  deliveryTiming.retryDelaysMs = TEST_RETRY_DELAYS_MS;
  window.history.replaceState(null, "", window.location.pathname);
  document.cookie = "XSRF-TOKEN=; Path=/; Max-Age=0";
});

afterAll(() => {
  server.close();
});
