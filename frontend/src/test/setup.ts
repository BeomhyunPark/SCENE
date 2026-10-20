import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../mocks/server";
import { resetOperatorSession } from "../mocks/handlers/session";
import { resetFormStore } from "../mocks/formStore";
import { resetOperatorStore } from "../mocks/operatorStore";
import { resetParticipantStore } from "../mocks/participantStore";
import { resetRetrospectiveStore } from "../mocks/retrospectiveStore";
import { resetAccessKeyCapture } from "../accessKey";
import { resetTaskStore } from "../mocks/taskStore";

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetOperatorSession();
  resetOperatorStore();
  resetTaskStore();
  resetRetrospectiveStore();
  resetParticipantStore();
  resetAccessKeyCapture();
  resetFormStore();
  window.history.replaceState(null, "", window.location.pathname);
  document.cookie = "XSRF-TOKEN=; Path=/; Max-Age=0";
});

afterAll(() => {
  server.close();
});
