import { describe, expect, it } from "vitest";
import type { ParticipantNotification } from "../../api/participantNotifications";
import { inboxHref } from "./inboxRoutes";

const ALL = { schedule: true, notices: true, groups: true, rooms: true };

function item(kind: string, type: string, id: string | null): ParticipantNotification {
  return { notificationId: "n", seq: 1, kind, target: { type, id }, title: "t", body: null, important: false, count: 1, createdAt: "2027-01-22T00:00:00Z", readAt: null };
}

describe("inboxHref (B5 #463)", () => {
  it("maps each kind to its screen", () => {
    expect(inboxHref("e1", item("NOTICE_PUBLISHED", "NOTICE", "n1"), ALL)).toBe("/participate/e1/notices/n1");
    expect(inboxHref("e1", item("NOTICE_UPDATED", "NOTICE", "n1"), ALL)).toBe("/participate/e1/notices/n1");
    expect(inboxHref("e1", item("SCHEDULE_CHANGED", "SCHEDULE", null), ALL)).toBe("/participate/e1/schedule");
    expect(inboxHref("e1", item("GROUP_PUBLISHED", "GROUP", null), ALL)).toBe("/participate/e1/group");
    expect(inboxHref("e1", item("ROOM_PUBLISHED", "ROOM", "r1"), ALL)).toBe("/participate/e1/rooms");
    expect(inboxHref("e1", item("APPLICATION_UPDATED_BY_OPERATOR", "APPLICATION", "a1"), ALL)).toBe("/participate/e1/me");
  });

  it("cannot open an unknown kind, a notice without an id, or an area that is off", () => {
    expect(inboxHref("e1", item("MEAL_ORDER_PUBLISHED", "MEAL_ORDER", null), ALL)).toBeNull();
    expect(inboxHref("e1", item("toString", "X", null), ALL)).toBeNull();
    expect(inboxHref("e1", item("NOTICE_PUBLISHED", "NOTICE", null), ALL)).toBeNull();
    expect(inboxHref("e1", item("ROOM_PUBLISHED", "ROOM", "r1"), { ...ALL, rooms: false })).toBeNull();
    expect(inboxHref("e1", item("GROUP_PUBLISHED", "GROUP", "g1"), null)).toBeNull();
  });
});
