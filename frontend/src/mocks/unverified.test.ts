import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./server";
import { clearUnverifiedRegistry, unverified, unverifiedRegistry } from "./unverified";

describe("unverified", () => {
  it("adds the header and registers the handler", async () => {
    clearUnverifiedRegistry();
    const handler = unverified(
      http.get("/api/v1/not-on-server", () => HttpResponse.json({ ok: true })),
      "서버에 없는 경로",
    );

    expect(unverifiedRegistry()).toEqual([
      {
        method: "GET",
        path: "/api/v1/not-on-server",
        note: "서버에 없는 경로",
      },
    ]);

    server.use(handler);
    const response = await fetch(`${window.location.origin}/api/v1/not-on-server`);
    expect(response.headers.get("x-scene-mock")).toBe("unverified");
    clearUnverifiedRegistry();
  });
});
