import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../mocks/server";
import { resetOperatorSession } from "../mocks/handlers/session";
import { resetFormStore } from "../mocks/formStore";
import { resetOperatorStore } from "../mocks/operatorStore";
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
  resetFormStore();
  document.cookie = "XSRF-TOKEN=; Path=/; Max-Age=0";
});

afterAll(() => {
  server.close();
});
