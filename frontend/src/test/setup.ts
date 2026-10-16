import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../mocks/server";
import { resetOperatorSession } from "../mocks/handlers/session";

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetOperatorSession();
  document.cookie = "XSRF-TOKEN=; Path=/; Max-Age=0";
});

afterAll(() => {
  server.close();
});
