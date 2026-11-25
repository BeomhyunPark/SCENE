import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { boardSlotsOf } from "../mocks/groupStore";
import { setLifecycle } from "../mocks/operatorStore";
import { deleteScheduleItem, fillScheduleSlots, readParticipantSchedule, readScheduleBoard, setSchedulePeriod } from "../mocks/scheduleStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

type Board = { items: { itemId: string; slotId: string | null; title: string; version: number; autoFilled: boolean }[] };

async function open() {
  setLifecycle(EVENT, "ACTIVE", 2);
  await login({ userId: OWNER });
  render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/schedule`]}>
      <App />
    </MemoryRouter>,
  );
}

describe("식사·집회 칸 on the schedule (DEC-090)", () => {
  it("says the 칸 came in by themselves and stay off participants until published", async () => {
    setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
    const slots = (boardSlotsOf(EVENT) ?? []).filter((slot) => slot.day <= 3);
    const added = fillScheduleSlots(EVENT, OWNER);
    expect(added).toBe(slots.length);
    expect((readScheduleBoard(EVENT, OWNER) as Board).items.every((item) => item.autoFilled)).toBe(true);

    await open();
    expect(await screen.findByText(`식사·집회 ${added}개가 신청서 설정에서 자동으로 들어왔어요. 공개하면 참가자에게 보여요.`, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "식사·집회 다시 넣기" })).not.toBeInTheDocument();
    const participant = readParticipantSchedule(EVENT, "anyone") as { status: string };
    expect(participant.status).not.toBe("PUBLISHED");
  });

  it("puts a deleted 칸 back only when asked", async () => {
    setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
    fillScheduleSlots(EVENT, OWNER);
    const first = (readScheduleBoard(EVENT, OWNER) as Board).items[0];
    deleteScheduleItem(EVENT, first.itemId, OWNER, new URL(`http://local/?expectedVersion=${first.version}`));
    // A setup save does not bring it back.
    expect(fillScheduleSlots(EVENT, OWNER)).toBe(0);

    await open();
    expect(await screen.findByText("일정표에 없는 식사·집회 1개", {}, WAIT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "식사·집회 다시 넣기" }));
    expect(await screen.findByText("식사·집회 1개를 다시 넣었어요. 공개하면 참가자에게 보여요.", {}, WAIT)).toBeInTheDocument();
    expect((readScheduleBoard(EVENT, OWNER) as Board).items.some((item) => item.slotId === first.slotId)).toBe(true);
  });
});
