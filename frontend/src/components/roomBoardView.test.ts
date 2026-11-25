import { describe, expect, it } from "vitest";
import type { Room, RoomParticipant } from "../api/rooms";
import { groupMembers, nextRoomName, nightsText, numberedRoomNames, planRoomMove, warningText } from "./roomBoardView";

function person(id: string, patch: Partial<RoomParticipant> = {}): RoomParticipant {
  return {
    participantId: id,
    name: id,
    cohort: null,
    gender: null,
    attendance: "FULL",
    slotIds: null,
    lodging: "LODGING",
    lodgingNights: [1, 2],
    group: null,
    draftGroupId: null,
    roomId: null,
    publishedRoomId: null,
    review: null,
    ...patch,
  };
}

function room(name: string): Room {
  return { roomId: name, name, locationNote: null, capacity: null, gender: null, sortOrder: 0, version: 0, memberCount: 0, warnings: [] };
}

describe("room board view (G3 #458)", () => {
  it("plans a move with what this screen saw and leaves out people who do not sleep over", () => {
    const people = [
      person("a"),
      person("b", { roomId: "r1" }),
      person("c", { lodging: "NOT_LODGING", lodgingNights: [] }),
      person("d", { roomId: "r2" }),
      person("e", { lodging: "NOT_LODGING", lodgingNights: [], roomId: "r1" }),
    ];
    const into = planRoomMove(people, ["a", "b", "c", "d", "e", "zz"], "r1");
    expect(into.changes).toEqual([
      { participantId: "a", fromRoomId: null, toRoomId: "r1" },
      { participantId: "d", fromRoomId: "r2", toRoomId: "r1" },
    ]);
    expect(into.notLodging.map((item) => item.participantId)).toEqual(["c"]);
    // Taking out is always allowed, also for someone who dropped lodging.
    const out = planRoomMove(people, ["b", "e", "a"], null);
    expect(out.changes.map((change) => change.participantId)).toEqual(["b", "e"]);
    expect(out.notLodging).toEqual([]);
  });

  it("reads a group from the publication or from the working copy", () => {
    const people = [person("a", { group: { groupId: "g1", name: "1조" }, draftGroupId: "g2" }), person("b", { draftGroupId: "g1" })];
    expect(groupMembers(people, "g1", "published").map((item) => item.participantId)).toEqual(["a"]);
    expect(groupMembers(people, "g1", "draft").map((item) => item.participantId)).toEqual(["b"]);
  });

  it("names rooms", () => {
    expect(nextRoomName([])).toBe("방 1");
    expect(nextRoomName([room("301호"), room("302호")])).toBe("303호");
    expect(nextRoomName([room("A-09")])).toBe("A-10");
    expect(numberedRoomNames("", 301, 303, "호")).toEqual(["301호", "302호", "303호"]);
    expect(numberedRoomNames("본관 ", 1, 2, "")).toEqual(["본관 1", "본관 2"]);
    expect(numberedRoomNames("", 5, 4, "호")).toEqual([]);
    expect(numberedRoomNames("", 1, 101, "")).toEqual([]);
  });

  it("describes nights and warnings", () => {
    expect(nightsText(person("a"))).toBe("1·2박째");
    expect(nightsText(person("a", { lodging: "UNKNOWN", lodgingNights: null }))).toBe("숙박 모름");
    expect(nightsText(person("a", { lodging: "NOT_LODGING", lodgingNights: [] }))).toBe("숙박 안 함");
    expect(warningText({ code: "OVER_CAPACITY", count: 7, capacity: 6 })).toBe("정원 초과 7/6");
    expect(warningText({ code: "GENDER_UNKNOWN", participantIds: ["a", "b"] })).toBe("성별 모름 2명");
  });
});
