import { describe, expect, it } from "vitest";
import { parseParticipantRooms } from "./participantRooms";

describe("parseParticipantRooms (#459)", () => {
  it("keeps only the contract keys of each person", () => {
    const parsed = parseParticipantRooms({
      status: "ASSIGNED",
      publishedAt: "2027-01-10T09:00:00Z",
      rosterScope: "ALL",
      notLodging: false,
      myRoom: { roomId: "r1", name: "301호", locationNote: "", genderLabel: null, members: [{ name: "김", cohort: "94", gender: "남성", me: true, participantId: "p1", phone: "010" }] },
      rooms: [{ roomId: "r1", name: "301호", members: [{ name: "김", cohort: "94", participantId: "p1", gender: "남성" }] }],
    });
    expect(parsed.myRoom?.members).toEqual([{ name: "김", cohort: "94", gender: "남성", me: true }]);
    expect(parsed.myRoom?.locationNote).toBeNull();
    expect(parsed.rooms?.[0].members).toEqual([{ name: "김", cohort: "94" }]);
  });

  it("drops what a narrower scope should not show", () => {
    const body = {
      status: "ASSIGNED",
      publishedAt: null,
      myRoom: { roomId: "r1", name: "301호", members: [{ name: "김", cohort: "94", gender: null, me: true }] },
      rooms: [{ roomId: "r1", name: "301호", members: [] }],
    };
    expect(parseParticipantRooms({ ...body, rosterScope: "ROOMMATES" }).rooms).toBeNull();
    const mine = parseParticipantRooms({ ...body, rosterScope: "MY_ROOM" });
    expect(mine.rooms).toBeNull();
    expect(mine.myRoom?.members).toBeNull();
    // An unknown scope reads as MY_ROOM.
    expect(parseParticipantRooms({ ...body, rosterScope: "EVERYONE" }).myRoom?.members).toBeNull();
  });

  it("rejects an unknown status and an ASSIGNED answer without a room", () => {
    expect(() => parseParticipantRooms({ status: "MOVED" })).toThrow();
    expect(() => parseParticipantRooms({ status: "ASSIGNED", rosterScope: "ALL", myRoom: null })).toThrow();
  });
});
