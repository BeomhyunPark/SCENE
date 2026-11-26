import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { seedCheckIn } from "../mocks/checkInStore";
import { localUsers } from "../mocks/fixtures/seed";
import { setMealCountsNow } from "../mocks/mealCounts";
import { tableApplications } from "../mocks/participantStore";
import { RETREAT, seedRetreat } from "../test/summarySeed";

const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

/** Full and arrived, full and not arrived, partial for day 2 lunch and dinner (as EventMeals.test): meal slots exist. */
function seedThree() {
  const retreat = seedRetreat();
  const arrived = retreat.apply({ NAME: "하나", COHORT: "94", GENDER: { optionId: "opt_female" }, ATTENDANCE: { optionId: "opt_full" } });
  retreat.apply({ NAME: "두리", COHORT: "95", GENDER: { optionId: "opt_male" }, ATTENDANCE: { optionId: "opt_full" } });
  retreat.apply({
    NAME: "세찬",
    COHORT: "96",
    GENDER: { optionId: "opt_male" },
    ATTENDANCE: { optionId: "opt_partial" },
    MEALS: { optionIds: ["opt_d2_lunch", "opt_d2_dinner"] },
  });
  const participant = tableApplications(RETREAT).find((row) => row.applicationId === arrived)!.participantId;
  seedCheckIn(RETREAT, participant);
}

function openField() {
  return render(
    <MemoryRouter initialEntries={[`/events/${RETREAT}/field`]}>
      <App />
    </MemoryRouter>,
  );
}

function names(): string[] {
  const list = screen.getByRole("list", { name: "체크인 명단" });
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.querySelector(".event-field__name")?.textContent ?? "");
}

/**
 * 현장 운영 shows how many have come, no more (2026-11-25). The 도착 예정 split by the next meal (E4 #456) was
 * taken off this screen; the server still sends `arrival`, the screen does not read it.
 */
describe("현장 운영 counts only", () => {
  it("shows 전체·미완료·완료 with their counts and no arrival split, even with meal slots and a late attendee", async () => {
    seedThree();
    // 19:10 on day 1: the full attendee who has not come would have been 왔어야 함 before.
    setMealCountsNow(new Date("2027-01-22T19:10:00+09:00"));
    await login({ userId: OWNER });
    openField();

    await screen.findByRole("listitem", { name: "95 두리" }, WAIT);
    const filters = screen.getByRole("group", { name: "체크인 상태로 보기" });
    expect(within(filters).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["전체 3명", "미완료 2명", "완료 1명"]);
    expect(within(filters).getAllByRole("button").map((button) => button.textContent)).toEqual(["전체 3", "미완료 2", "완료 1"]);
    expect(screen.queryByRole("region", { name: "미완료 도착 예정" })).not.toBeInTheDocument();
    for (const gone of ["왔어야 함", "올 예정", "도착 예정", "참석 칸", "예정 모름", "끼니", "기준"]) {
      expect(screen.queryByText(new RegExp(gone))).not.toBeInTheDocument();
    }

    // 미완료 still lists everyone who has not checked in.
    fireEvent.click(within(filters).getByRole("button", { name: "미완료 2명" }));
    await waitFor(() => expect(names()).toEqual(["95 두리", "96 세찬"]), WAIT);
  });
});
