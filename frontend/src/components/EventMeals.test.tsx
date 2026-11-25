import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { seedCheckIn } from "../mocks/checkInStore";
import { localUsers } from "../mocks/fixtures/seed";
import { setMealCountsNow } from "../mocks/mealCounts";
import { reviseApplication, tableApplications, withdrawParticipantApplication } from "../mocks/participantStore";
import { seedScheduleItem } from "../mocks/scheduleStore";
import { server } from "../mocks/server";
import { RETREAT, seedRetreat } from "../test/summarySeed";

const OWNER = localUsers[0].userId;

function openMeals() {
  return render(
    <MemoryRouter initialEntries={[`/events/${RETREAT}/meals`]}>
      <App />
    </MemoryRouter>,
  );
}

/** Full and arrived, full and not arrived, partial for day 2 lunch and dinner. */
function seedThree() {
  const retreat = seedRetreat();
  const arrived = retreat.apply({ NAME: "하나", COHORT: "94", GENDER: { optionId: "opt_female" }, ATTENDANCE: { optionId: "opt_full" } });
  const late = retreat.apply({ NAME: "두리", COHORT: "95", GENDER: { optionId: "opt_male" }, ATTENDANCE: { optionId: "opt_full" } });
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
  return { retreat, arrived, late, partial };
}

/** One meal's row of the day table: 예정, 도착 반영, 올 예정, 아직 안 옴 (#485). */
function row(name: string) {
  return within(screen.getByRole("row", { name }));
}

function counts(name: string) {
  return row(name)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("식수 현황 screen", () => {
  it("shows the next meal with planned and arrival-reflected counts side by side", async () => {
    seedThree();
    // 19:10 on day 1: dinner has passed, so the next meal is day 2 breakfast.
    setMealCountsNow(new Date("2027-01-22T19:10:00+09:00"));
    await login({ userId: OWNER });
    openMeals();

    const next = await screen.findByRole("region", { name: /다음 끼니/ });
    expect(next).toHaveTextContent("다음 끼니 · 1월 23일 (토) 아침 08:00 (기본 시각)");
    expect(within(next).getByText("1명")).toBeInTheDocument();
    // The split is in the table row marked 다음, once.
    expect(row("1월 23일 (토) 아침").getByText("다음")).toBeInTheDocument();
    expect(counts("1월 23일 (토) 아침")).toEqual(["2", "1", "0", "1"]);

    const table = within(screen.getByRole("region", { name: "끼니별 식수" }));
    expect(table.getByRole("heading", { name: "1월 22일 (금)" })).toBeInTheDocument();
    const dinner = row("1월 22일 (금) 저녁");
    expect(dinner.getByText("지남")).toBeInTheDocument();
    // Day 2 lunch: the partial attendee is still coming, the late full attendee is missing.
    const lunch = row("1월 23일 (토) 점심");
    expect(lunch.getByRole("rowheader")).toHaveTextContent("점심 12:00");
    expect(counts("1월 23일 (토) 점심")).toEqual(["3", "2", "1", "1"]);
    // Worship slots are not meals.
    expect(screen.queryByRole("row", { name: /집회/ })).not.toBeInTheDocument();
  });

  it("copies the next meal and the remaining meals for the kitchen", async () => {
    seedThree();
    setMealCountsNow(new Date("2027-01-22T19:10:00+09:00"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await login({ userId: OWNER });
    openMeals();

    fireEvent.click(await screen.findByRole("button", { name: "다음 끼니 복사" }));
    expect(await screen.findByText("다음 끼니를 복사했어요. 주방 연락처에 붙여 넣어 주세요.")).toBeInTheDocument();
    expect(writeText).toHaveBeenLastCalledWith(
      "[겨울 수련회] 식수 (1/22 19:10 기준)\n1월 23일 (토) 아침 1명 (신청 2명, 아직 안 온 1명 제외)",
    );

    fireEvent.click(screen.getByRole("button", { name: "남은 끼니 복사" }));
    const text = String(writeText.mock.lastCall?.[0]);
    expect(text.split("\n")).toEqual([
      "[겨울 수련회] 식수 (1/22 19:10 기준)",
      "1월 23일 (토) 아침 1명 (신청 2명, 아직 안 온 1명 제외)",
      "1월 23일 (토) 점심 2명 (신청 3명, 아직 안 온 1명 제외)",
      "1월 23일 (토) 저녁 2명 (신청 3명, 아직 안 온 1명 제외)",
      "1월 24일 (일) 아침 1명 (신청 2명, 아직 안 온 1명 제외)",
      "1월 24일 (일) 점심 1명 (신청 2명, 아직 안 온 1명 제외)",
    ]);
  });

  it("shows the text to copy by hand when the clipboard is not there", async () => {
    seedThree();
    setMealCountsNow(new Date("2027-01-20T09:00:00+09:00"));
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    await login({ userId: OWNER });
    openMeals();

    fireEvent.click(await screen.findByRole("button", { name: "다음 끼니 복사" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("복사하지 못했어요");
    expect(screen.getByRole("textbox", { name: "복사할 글" })).toHaveValue(
      "[겨울 수련회] 식수 (1/20 09:00 기준)\n1월 22일 (금) 저녁 2명",
    );
  });

  it("uses the schedule time and reflects an edit and a withdrawal on refresh", async () => {
    const { retreat, partial, late } = seedThree();
    seedScheduleItem(RETREAT, { day: 2, startTime: "07:00", title: "아침 식사", category: "MEAL", slotId: "opt_d2_breakfast" });
    setMealCountsNow(new Date("2027-01-23T07:30:00+09:00"));
    await login({ userId: OWNER });
    openMeals();

    const next = await screen.findByRole("region", { name: /다음 끼니/ });
    expect(next).toHaveTextContent("1월 23일 (토) 아침 07:00 (일정표)");
    expect(counts("1월 23일 (토) 저녁")[0]).toBe("3");

    // A4: the partial attendee drops dinner. A7: the late attendee is withdrawn.
    reviseApplication(RETREAT, partial, { [retreat.fieldId("MEALS")]: { optionIds: ["opt_d2_lunch"] } });
    withdrawParticipantApplication(RETREAT, late, {
      withdrawnAt: "2027-01-23T07:20:00Z",
      withdrawnByDisplayName: null,
      reason: null,
      reapplyBlocked: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "새로 고침" }));
    await waitFor(() => expect(counts("1월 23일 (토) 저녁")).toEqual(["1", "1", "0", "0"]));
    expect(counts("1월 23일 (토) 점심")).toEqual(["2", "2", "1", "0"]);
  });

  it("reads again every 10 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      seedThree();
      setMealCountsNow(new Date("2027-01-20T09:00:00+09:00"));
      let reads = 0;
      server.events.on("request:start", ({ request }) => {
        if (new URL(request.url).pathname.endsWith("/meal-counts")) reads += 1;
      });
      await login({ userId: OWNER });
      openMeals();
      await screen.findByRole("region", { name: /다음 끼니/ });
      const first = reads;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_500);
      });
      expect(reads).toBeGreaterThan(first);
    } finally {
      server.events.removeAllListeners();
      vi.useRealTimers();
    }
  });

  it("explains an event without meal slots and a reader without permission", async () => {
    seedRetreat(null);
    await login({ userId: OWNER });
    const { unmount } = openMeals();
    expect(await screen.findByRole("heading", { name: "식사 칸이 없어요" })).toBeInTheDocument();
    unmount();

    server.use(
      http.get("/api/v1/operator/events/:eventId/meal-counts", () =>
        HttpResponse.json({ code: "FORBIDDEN", status: 403 }, { status: 403, headers: { "Content-Type": "application/problem+json" } }),
      ),
    );
    openMeals();
    expect(await screen.findByRole("heading", { name: "식수 현황을 볼 권한이 없어요" })).toBeInTheDocument();
  });

  it("is in the event menu and linked from 현장 운영", async () => {
    seedThree();
    await login({ userId: OWNER });
    render(
      <MemoryRouter initialEntries={[`/events/${RETREAT}/field`]}>
        <App />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: "식수 현황 보기" });
    expect(link).toHaveAttribute("href", `/events/${RETREAT}/meals`);
    expect(screen.getAllByRole("link", { name: "식수 현황" })[0]).toHaveAttribute("href", `/events/${RETREAT}/meals`);
  });
});
