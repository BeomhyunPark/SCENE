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

/**
 * Full and arrived (하나), full and not arrived (두리), partial from day 2 lunch (세찬), as EventMeals.test.
 * At 19:10 on day 1 the server says 두리 is late (OVERDUE) and 세찬 is due later (COMING).
 */
function seedThree() {
  const retreat = seedRetreat();
  const arrived = retreat.apply({ NAME: "하나", COHORT: "94", GENDER: { optionId: "opt_female" }, ATTENDANCE: { optionId: "opt_full" } });
  retreat.apply({ NAME: "두리", COHORT: "95", GENDER: { optionId: "opt_male" }, ATTENDANCE: { optionId: "opt_full" } });
  const partial = retreat.apply({
    NAME: "세찬",
    COHORT: "96",
    GENDER: { optionId: "opt_male" },
    ATTENDANCE: { optionId: "opt_partial" },
    MEALS: { optionIds: ["opt_d2_lunch", "opt_d2_dinner"] },
  });
  const participant = (applicationId: string) =>
    tableApplications(RETREAT).find((row) => row.applicationId === applicationId)!.participantId;
  seedCheckIn(RETREAT, participant(arrived));
  return { partial: participant(partial) };
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

function chips(): (string | null)[] {
  const filters = screen.getByRole("group", { name: "체크인 상태로 보기" });
  return within(filters)
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
}

function badge(name: string): string {
  return screen.getByRole("listitem", { name }).querySelector(".event-field__badge")?.textContent ?? "";
}

/**
 * 현장 운영 says 도착 · 미도착 · 도착 예정 and nothing else (user decision 2026-11-26). 도착 예정 comes from the
 * server's `arrival` (COMING); a checked-in person is 도착 whenever they signed up to come.
 */
describe("현장 운영 도착 · 미도착 · 도착 예정", () => {
  it("names each person by one of the three words and filters by them", async () => {
    seedThree();
    setMealCountsNow(new Date("2027-01-22T19:10:00+09:00"));
    await login({ userId: OWNER });
    openField();

    await screen.findByRole("listitem", { name: "95 두리" }, WAIT);
    await waitFor(() => expect(chips()).toEqual(["전체 3명", "미도착 1명", "도착 예정 1명", "도착 1명"]), WAIT);
    expect(badge("95 두리")).toBe("미도착");
    expect(badge("96 세찬")).toBe("도착 예정");
    expect(badge("94 하나")).toBe("도착");
    // Only a 도착 예정 row says when; it does not say 도착 예정 twice.
    expect(screen.getByRole("listitem", { name: "96 세찬" })).toHaveTextContent("2일차 점심");
    expect(screen.getByRole("listitem", { name: "96 세찬" }).textContent?.match(/도착 예정/g)).toHaveLength(1);
    expect(screen.getByRole("listitem", { name: "95 두리" })).not.toHaveTextContent("일차");
    expect(screen.getByRole("listitem", { name: "94 하나" })).not.toHaveTextContent("일차");
    for (const gone of ["왔어야 함", "올 예정", "참석 칸", "예정 모름", "체크인 완료", "미완료", "끼니", "기준", "식수 현황 보기"]) {
      expect(screen.queryByText(new RegExp(gone))).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "미도착 1명" }));
    await waitFor(() => expect(names()).toEqual(["95 두리"]), WAIT);
    fireEvent.click(screen.getByRole("button", { name: "도착 예정 1명" }));
    await waitFor(() => expect(names()).toEqual(["96 세찬"]), WAIT);
    fireEvent.click(screen.getByRole("button", { name: "도착 1명" }));
    await waitFor(() => expect(names()).toEqual(["94 하나"]), WAIT);
  });

  it("counts someone who came earlier than they signed up for as 도착, and hides 도착 예정 at zero", async () => {
    const { partial } = seedThree();
    // 세찬 signed up from day 2 lunch but checks in on day 1.
    seedCheckIn(RETREAT, partial);
    setMealCountsNow(new Date("2027-01-22T19:10:00+09:00"));
    await login({ userId: OWNER });
    openField();

    await screen.findByRole("listitem", { name: "96 세찬" }, WAIT);
    await waitFor(() => expect(chips()).toEqual(["전체 3명", "미도착 1명", "도착 2명"]), WAIT);
    expect(badge("96 세찬")).toBe("도착");
    expect(screen.getByRole("listitem", { name: "96 세찬" })).not.toHaveTextContent("일차");
    expect(screen.queryByText("도착 예정")).not.toBeInTheDocument();
  });
});
