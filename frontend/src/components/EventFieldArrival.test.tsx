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

/** Full and arrived, full and not arrived, partial for day 2 lunch and dinner (as EventMeals.test). */
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

function open(path: "field" | "meals") {
  return render(
    <MemoryRouter initialEntries={[`/events/${RETREAT}/${path}`]}>
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

describe("현장 운영 도착 예정 (E4 #456)", () => {
  it("shows each person's due slot and keeps a later partial attendee out of 왔어야 함", async () => {
    seedThree();
    // 19:10 on day 1: dinner has passed, the next meal is day 2 breakfast.
    setMealCountsNow(new Date("2027-01-22T19:10:00+09:00"));
    await login({ userId: OWNER });
    open("field");

    const late = await screen.findByRole("listitem", { name: "95 두리" }, WAIT);
    expect(late).toHaveTextContent("1일차 저녁 도착 예정 · 왔어야 함");
    const partial = screen.getByRole("listitem", { name: "96 세찬" });
    expect(partial).toHaveTextContent("2일차 점심 도착 예정 · 올 예정");
    expect(screen.getByRole("listitem", { name: "94 하나" })).toHaveTextContent("1일차 저녁 도착 예정");

    const arrivals = screen.getByRole("region", { name: "미완료 도착 예정" });
    expect(arrivals).toHaveTextContent("다음 끼니 2일차 아침 기준");
    expect(arrivals).toHaveTextContent("왔어야 함 1명");
    expect(arrivals).toHaveTextContent("올 예정 1명");

    // 미완료 still lists both; 왔어야 함 lists only the late full attendee.
    fireEvent.click(screen.getByRole("button", { name: "미완료" }));
    await waitFor(() => expect(names()).toEqual(["95 두리", "96 세찬"]), WAIT);
    fireEvent.click(screen.getByRole("button", { name: "왔어야 함" }));
    await waitFor(() => expect(names()).toEqual(["95 두리"]), WAIT);
  });

  it("names as many late people as 식수 현황's 아직 안 옴 for the next meal", async () => {
    seedThree();
    setMealCountsNow(new Date("2027-01-22T19:10:00+09:00"));
    await login({ userId: OWNER });
    const meals = open("meals");
    // The next meal's 아직 안 옴 is the last column of its row in the day table (#485).
    const next = await screen.findByRole("row", { name: "1월 23일 (토) 아침" }, WAIT);
    expect(within(next).getByText("다음")).toBeInTheDocument();
    expect(within(next).getAllByRole("cell").at(-1)).toHaveTextContent("1");
    meals.unmount();

    open("field");
    const arrivals = await screen.findByRole("region", { name: "미완료 도착 예정" }, WAIT);
    expect(arrivals).toHaveTextContent("왔어야 함 1명");

    // Day 2 at 13:30: lunch has passed, so the partial attendee is late too, on both screens.
    setMealCountsNow(new Date("2027-01-23T13:30:00+09:00"));
    fireEvent.click(within(arrivals).getByRole("button", { name: /왔어야 함/ }));
    await waitFor(() => expect(names()).toEqual(["95 두리", "96 세찬"]), WAIT);
    expect(screen.getByRole("listitem", { name: "96 세찬" })).toHaveTextContent("2일차 점심 도착 예정 · 왔어야 함");
  });

  it("shows no arrival line for an event without slots", async () => {
    seedRetreat(null);
    await login({ userId: OWNER });
    open("field");
    await screen.findByText(/신청을 마친 참가자가 아직 없어요|명\b/, {}, WAIT);
    expect(screen.queryByRole("region", { name: "미완료 도착 예정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "왔어야 함" })).not.toBeInTheDocument();
  });
});
