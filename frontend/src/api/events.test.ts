import { describe, expect, it } from "vitest";
import { createEvent, listEvents } from "./events";
import { login } from "./session";
import { localSpace, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests } from "../mocks/operatorStore";

describe("event requests", () => {
  it("does not send sort and omits empty create fields", async () => {
    await login({ userId: localUsers[0].userId });
    await listEvents(localSpace.spaceId, { page: 0, size: 50 });
    const listed = operatorRequests.find((request) => request.method === "GET");
    expect(listed?.url).toBe(`/api/v1/operator/spaces/${localSpace.spaceId}/events?page=0&size=50`);
    expect(listed?.url).not.toContain("sort");

    await createEvent(localSpace.spaceId, {
      name: "가을 수련회",
      startDate: "",
      endDate: undefined,
      place: "",
      eventType: undefined,
    });
    const created = operatorRequests.find((request) => request.method === "POST");
    expect(created?.body).toEqual({ name: "가을 수련회" });
  });
});
