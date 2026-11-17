import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import type { ApplicationSummary } from "../api/applicationSummary";
import { login } from "../api/session";
import { localUsers } from "../mocks/fixtures/seed";
import { server } from "../mocks/server";
import { RETREAT, seedFourApplicants, seedRetreat } from "../test/summarySeed";

const OWNER = localUsers[0].userId;
const SUMMARY_PATH = "/api/v1/operator/events/:eventId/applications/summary";

function openSummary() {
  return render(
    <MemoryRouter initialEntries={[`/events/${RETREAT}/participants/summary`]}>
      <App />
    </MemoryRouter>,
  );
}

async function card(name: string) {
  return within(await screen.findByRole("region", { name }));
}

const choice = (rows: [string, string, number, boolean?][], noAnswer = 0) => ({
  options: rows.map(([optionId, label, count, hidden = false]) => ({ optionId, label, hidden, count })),
  noAnswer,
});

/** A server answer with turned-off areas, turned-off options and unanswered choosers. */
const partlyAsked: ApplicationSummary = {
  eventStatus: "ACTIVE",
  formId: "form-1",
  fromSetup: true,
  total: 5,
  attendance: { asked: true, full: 2, partial: 2, worshipOnly: 1 },
  gender: null,
  cohorts: null,
  meals: {
    days: [
      {
        day: 1,
        date: "2027-01-22",
        label: "1월 22일 (금)",
        slots: [
          { optionId: "opt_d1_dinner", meal: "DINNER", label: "저녁", count: 3 },
          { optionId: "opt_d1_worship", meal: "WORSHIP", label: "저녁 집회", count: 4 },
        ],
      },
      {
        day: 2,
        date: "2027-01-23",
        label: "1월 23일 (토)",
        slots: [{ optionId: "opt_d2_breakfast", meal: "BREAKFAST", label: "아침", count: 2 }],
      },
    ],
    unanswered: 2,
  },
  lodging: null,
  transport: {
    in: choice([
      ["opt_group", "단체 이동 차량", 2, true],
      ["opt_shuttle", "집회 차량", 0, true],
      ["opt_car", "자차", 3],
    ]),
    out: choice([
      ["opt_group", "단체 이동 차량", 2, true],
      ["opt_car", "자차", 3],
    ], 1),
  },
  shuttle: { in: null, out: choice([["opt_d1", "1월 22일 (금) 집회 후", 1]]) },
  carpool: null,
  mobility: { in: [], out: null },
};

describe("신청 집계 screen", () => {
  it("shows every area with large counts and links names to the application", async () => {
    const { ids } = seedFourApplicants();
    await login({ userId: OWNER });
    openSummary();

    expect(await screen.findByRole("heading", { name: "신청 집계" })).toBeInTheDocument();
    const overview = await card("신청");
    expect(overview.getByText("4")).toBeInTheDocument();
    expect(overview.getByText("부분 참석").parentElement).toHaveTextContent("부분 참석2");
    expect(overview.getByText("집회만 참석").parentElement).toHaveTextContent("1");
    expect(overview.getByText("여성").parentElement).toHaveTextContent("여성2");
    expect(overview.getByText("94").parentElement).toHaveTextContent("941");
    expect(overview.getAllByText("답 없음")).toHaveLength(2);

    const meals = await card("식수·집회");
    const table = meals.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "일차",
      "아침",
      "점심",
      "저녁",
      "집회",
    ]);
    const day1 = within(table).getByRole("row", { name: /1일차/ });
    expect(within(day1).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["–", "–", "2", "1"]);
    expect(meals.getByText("부분·집회만 참석 1명은 식사 답이 없어 위 숫자에 들어가지 않았어요.")).toBeInTheDocument();

    const lodging = await card("숙박");
    expect(lodging.getByText("첫째 밤 (1월 22일 (금))").parentElement).toHaveTextContent("2명");

    const transport = await card("차량");
    expect(transport.getByRole("heading", { name: "집회 차량 회차" })).toBeInTheDocument();
    expect(transport.getAllByText("자차")).toHaveLength(2);
    expect(transport.getAllByText("직접 운전 1 · 합승 0")).toHaveLength(2);
    // Church vehicle seats come first, large, both ways.
    const vehicles = within(transport.getByRole("list", { name: "교회 차량 탑승 인원" }));
    expect(vehicles.getByText("단체 이동 차량").parentElement).toHaveTextContent("가는 길 1명오는 길 1명");
    expect(vehicles.getByText("집회 차량").parentElement).toHaveTextContent("가는 길 1명오는 길 1명");

    const rides = await card("카풀·이동 지원");
    expect(rides.getByText(/운전자/)).toHaveTextContent("운전자 1명 · 좌석 3석");
    expect(rides.getByText("3석 · 분당")).toBeInTheDocument();
    expect(rides.getByText("판교 경유 가능")).toBeInTheDocument();
    expect(rides.getByRole("link", { name: "95 나래" })).toHaveAttribute(
      "href",
      `/events/${RETREAT}/participants/summary?applicant=${ids.driver}`,
    );
    expect(rides.getAllByRole("link", { name: "라온" })[0]).toHaveAttribute(
      "href",
      `/events/${RETREAT}/participants/summary?applicant=${ids.rider}`,
    );
    expect(screen.queryByText(/010-/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "인쇄" })).toBeInTheDocument();
  });

  it("orders 또래 chips by birth year: 98, 99, 00, 01", async () => {
    seedRetreat();
    const cohorts = { items: ["00", "01", "98", "99"].map((cohort) => ({ cohort, count: 1 })), noAnswer: 0 };
    server.use(http.get(SUMMARY_PATH, () => HttpResponse.json({ ...partlyAsked, cohorts })));
    await login({ userId: OWNER });
    openSummary();
    const overview = await card("신청");
    const chips = within(overview.getByText("또래").parentElement!).getAllByRole("listitem");
    expect(chips.map((chip) => chip.firstChild?.textContent)).toEqual(["98", "99", "00", "01"]);
  });

  it("says why an area is missing, keeps used turned-off options and shows unanswered", async () => {
    seedRetreat();
    server.use(http.get(SUMMARY_PATH, () => HttpResponse.json(partlyAsked)));
    await login({ userId: OWNER });
    openSummary();

    const overview = await card("신청");
    expect(overview.getAllByText("이 신청서에서는 묻지 않았어요.")).toHaveLength(2);
    expect(overview.queryByText("0")).not.toBeInTheDocument();

    const meals = await card("식수·집회");
    expect(meals.getByText("저녁 집회")).toBeInTheDocument();
    expect(within(meals.getByRole("row", { name: /2일차/ })).getAllByRole("cell")[0]).toHaveTextContent("2");
    expect(meals.getByText(/부분·집회만 참석 2명은 식사 답이 없어/)).toBeInTheDocument();

    expect((await card("숙박")).getByText("하루 행사이거나 숙박을 묻지 않았어요.")).toBeInTheDocument();

    const transport = await card("차량");
    expect(transport.getAllByText("(꺼짐)", { exact: false })).toHaveLength(2);
    expect(transport.queryByText("집회 차량")).not.toBeInTheDocument();
    expect(transport.getAllByText("답 없음")).toHaveLength(1);
    expect(transport.getByText("이 신청서에서는 묻지 않았어요.")).toBeInTheDocument();

    const rides = await card("카풀·이동 지원");
    expect(rides.getAllByText("이 신청서에서는 묻지 않았어요.")).toHaveLength(2);
    expect(rides.getByText("아직 없어요.")).toBeInTheDocument();
  });

  it("explains a form made without the setup card", async () => {
    const retreat = seedRetreat(null);
    retreat.apply({ NAME: "하나", COHORT: "94" });
    await login({ userId: OWNER });
    openSummary();

    expect(await screen.findByRole("heading", { name: "설정 카드로 만든 신청서가 아니에요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "신청서 설정으로 가기" })).toHaveAttribute(
      "href",
      `/events/${RETREAT}/participants/setup`,
    );
    const overview = await card("신청");
    expect(overview.getByText("참석 방식을 묻지 않아 모두 전체 참석으로 셌어요.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "식수·집회" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "차량" })).not.toBeInTheDocument();
  });

  it("shows the empty state with no applications", async () => {
    seedRetreat();
    await login({ userId: OWNER });
    openSummary();

    expect(await screen.findByRole("heading", { name: "아직 들어온 신청이 없어요" })).toBeInTheDocument();
    expect((await card("신청")).getByText("0", { selector: ".app-summary__card-head strong" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "인쇄" })).not.toBeInTheDocument();
  });

  it("says when the event has no form yet", async () => {
    seedRetreat();
    server.use(
      http.get(SUMMARY_PATH, () =>
        HttpResponse.json({ ...partlyAsked, formId: null, fromSetup: false, total: 0, meals: null, transport: null, shuttle: null, mobility: null }),
      ),
    );
    await login({ userId: OWNER });
    openSummary();

    expect(await screen.findByRole("heading", { name: "아직 신청서가 없어요" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "신청" })).not.toBeInTheDocument();
  });

  it("says so without read permission", async () => {
    seedRetreat();
    server.use(
      http.get(SUMMARY_PATH, () =>
        HttpResponse.json(
          { code: "FORBIDDEN", status: 403 },
          { status: 403, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await login({ userId: OWNER });
    openSummary();

    expect(await screen.findByRole("heading", { name: "신청 집계를 볼 권한이 없어요" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "신청" })).not.toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    seedRetreat();
    let calls = 0;
    server.use(
      http.get(SUMMARY_PATH, () => {
        calls += 1;
        // The query client retries a 5xx once before showing the error.
        return calls <= 2 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(partlyAsked);
      }),
    );
    await login({ userId: OWNER });
    openSummary();

    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("집계를 불러오지 못했어요.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("region", { name: "식수·집회" })).toBeInTheDocument();
  });

  it("is reachable from the event home", async () => {
    seedRetreat();
    await login({ userId: OWNER });
    render(
      <MemoryRouter initialEntries={[`/events/${RETREAT}`]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("link", { name: /신청 집계/ }));
    expect(await screen.findByRole("heading", { name: "신청 집계" })).toBeInTheDocument();
  });

  it("is reachable from 참가 현황", async () => {
    const retreat = seedRetreat();
    retreat.apply({ NAME: "하나", COHORT: "94" });
    await login({ userId: OWNER });
    render(
      <MemoryRouter initialEntries={[`/events/${RETREAT}/participants`]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("link", { name: "신청 집계" }));
    expect(await screen.findByRole("heading", { name: "신청 집계" })).toBeInTheDocument();
  });
});
