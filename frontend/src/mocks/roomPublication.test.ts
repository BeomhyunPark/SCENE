import { describe, expect, it } from "vitest";
import { localEvent, localUsers } from "./fixtures/seed";
import { createForm, setAccepting } from "./formStore";
import { setLifecycle } from "./operatorStore";
import { readUpdates } from "./participantFeedStore";
import { readParticipantRooms } from "./participantRoomStore";
import { submitPublicApplication } from "./participantStore";
import { placeAsOtherOperator, publishRooms, readRoomBoard, seedRooms } from "./roomBoardStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;

function apply(name: string): string {
  const form = createForm(EVENT, OWNER, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  const answers = form.fields.flatMap((field) => {
    if (field.systemKey === "NAME") return [{ fieldId: field.fieldId, text: name }];
    if (field.systemKey === "PHONE") return [{ fieldId: field.fieldId, text: "010-2222-3333" }];
    if (field.systemKey === "COHORT") return [{ fieldId: field.fieldId, text: "94" }];
    return [];
  });
  const issued = submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
  if ("code" in issued) throw new Error(issued.code);
  return issued.participantId;
}

function boardVersion(): number {
  const board = readRoomBoard(EVENT, OWNER);
  if ("code" in board) throw new Error(board.code);
  return board.boardVersion;
}

function publish() {
  return publishRooms(EVENT, OWNER, { expectedBoardVersion: boardVersion(), confirmUnassigned: true, confirmNotLodging: true });
}

describe("operator room publication reaches the participant rooms mock (G3 #458 → G4 #459)", () => {
  it("shows the published room to the participant and raises updates.rooms once per publication", () => {
    const me = apply("김민수");
    const [r1] = seedRooms(EVENT, 1, 6);
    placeAsOtherOperator(EVENT, me, r1);
    expect(readParticipantRooms(EVENT, me).status).toBe("NOT_PUBLISHED");
    const before = readUpdates(EVENT, me).rooms;

    expect(publish()).toMatchObject({ result: "PUBLISHED" });
    const seen = readParticipantRooms(EVENT, me);
    expect(seen.status).toBe("ASSIGNED");
    expect(seen.myRoom?.roomId).toBe(r1);
    expect(seen.myRoom?.members).toContainEqual(expect.objectContaining({ name: "김민수", me: true }));
    expect(readUpdates(EVENT, me).rooms).toBe(before + 1);

    // Same board again: ALREADY_PUBLISHED leaves the participant view and the feed as they were.
    expect(publish()).toMatchObject({ result: "ALREADY_PUBLISHED" });
    expect(readUpdates(EVENT, me).rooms).toBe(before + 1);

    // Taken out of the room and published again: UNASSIGNED.
    placeAsOtherOperator(EVENT, me, null);
    expect(publish()).toMatchObject({ result: "PUBLISHED" });
    expect(readParticipantRooms(EVENT, me).status).toBe("UNASSIGNED");
    expect(readUpdates(EVENT, me).rooms).toBe(before + 2);
  });
});
