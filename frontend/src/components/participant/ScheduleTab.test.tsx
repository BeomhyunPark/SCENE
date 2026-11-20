import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { localEvent } from "../../mocks/fixtures/seed";
import { participantCardHandlers, UPDATES } from "../../mocks/participantHomeTestHandlers";
import { server } from "../../mocks/server";

const EVENT = localEvent.eventId;
const DAYS = [
  { day: 1, date: "2027-01-22", dayLabel: "1월 22일 (금)" },
  { day: 2, date: "2027-01-23", dayLabel: "1월 23일 (토)" },
];

// UPDATES.serverTime is 2027-01-22T05:30:12Z: 14:30 on day 1 in Korea, whatever the test machine's clock says.
function item(overrides: Record<string, unknown>) {
  const day = (overrides.day as number | undefined) ?? 1;
  const date = DAYS[day - 1].date;
  const startTime = overrides.startTime as string;
  const endTime = (overrides.endTime as string | null | undefined) ?? null;
  return {
    itemId: `item-${overrides.title as string}`,
    day,
    date,
    endTime,
    endsNextDay: false,
    startsAt: `${date}T${startTime}:00+09:00`,
    endsAt: endTime ? `${date}T${endTime}:00+09:00` : null,
    place: null,
    description: null,
    category: "PROGRAM",
    slotId: null,
    sortOrder: 0,
    leadersOnly: false,
    change: null,
    ...overrides,
  };
}

const ITEMS = [
  item({ title: "레크리에이션", startTime: "14:00", endTime: "15:00", place: "대강당", description: "편한 옷\n운동화" }),
  item({
    title: "저녁",
    startTime: "18:00",
    endTime: "19:00",
    place: "본관 식당",
    category: "MEAL",
    slotId: "opt_d1_dinner",
    change: { kind: "CHANGED", changedAt: "2027-01-22T05:00:00Z", fields: ["startTime", "place"], previous: { startTime: "17:30", place: "식당" } },
  }),
  item({
    title: "조장 모임",
    startTime: "22:00",
    endTime: "00:30",
    endsNextDay: true,
    endsAt: "2027-01-23T00:30:00+09:00",
    leadersOnly: true,
    change: { kind: "ADDED", changedAt: "2027-01-22T05:00:00Z", fields: [], previous: null },
  }),
  item({ title: "<b>오전 집회</b>", day: 2, startTime: "09:30", endTime: "11:00", category: "WORSHIP" }),
];

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    status: "PUBLISHED",
    publishedAt: "2027-01-22T05:00:00Z",
    timeZone: "Asia/Seoul",
    serverTime: UPDATES.serverTime,
    days: DAYS,
    items: ITEMS,
    removedItems: [{ itemId: "gone", day: 1, date: "2027-01-22", title: "산책", startTime: "16:00", removedAt: "2027-01-22T05:00:00Z" }],
    ...overrides,
  };
}

/** Handlers given first win, so each test puts its own schedule answer before these. */
function signedIn() {
  return [
    http.get("/api/v1/participant/me", () =>
      HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김" }),
    ),
    ...participantCardHandlers(),
  ];
}

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("participant schedule tab (C5)", () => {
  it("opens today's day with now and next, changes with the previous values, cancelled and leader items", async () => {
    const reads: unknown[] = [];
    server.use(http.get("/api/v1/participant/schedule", () => HttpResponse.json(schedule())),
      http.post("/api/v1/participant/notifications/read", async ({ request }) => {
        reads.push(await request.json());
        return HttpResponse.json({ unreadCount: 0 });
      }),
      ...signedIn(),
    );
    openApp(`/participate/${EVENT}/schedule`);
    const list = await screen.findByRole("list", { name: "1월 22일 (금)" });
    expect(screen.getByRole("tab", { name: /1일차/, selected: true })).toBeInTheDocument();
    expect(screen.getByText(/마지막 갱신 1월 22일 14:00/)).toBeInTheDocument();

    const rows = within(list).getAllByRole("listitem").filter((row) => row.parentElement === list);
    expect(rows.map((row) => row.querySelector(".participant-schedule__title")?.textContent)).toEqual([
      "레크리에이션지금",
      "산책취소됨",
      "저녁다음변경됨",
      "조장 모임새 일정조장",
    ]);
    expect(rows[0]).toHaveAttribute("aria-current", "time");
    expect(within(rows[0]).getByText("편한 옷\n운동화", { normalizer: (text) => text })).toBeInTheDocument();
    expect(within(rows[1]).getByText("산책").tagName).toBe("S");
    expect(within(rows[2]).getByText("시간 17:30–19:00 → 18:00–19:00")).toBeInTheDocument();
    expect(within(rows[2]).getByText("장소 식당 → 본관 식당")).toBeInTheDocument();
    expect(within(rows[3]).getByText("22:00–00:30 (다음 날)")).toBeInTheDocument();
    expect(screen.queryByText(/우리 조 순서/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /2일차/ }));
    // Plain text, never HTML.
    expect(await screen.findByText("<b>오전 집회</b>")).toBeInTheDocument();
    expect(reads).toEqual([{ target: { type: "SCHEDULE", id: null } }]);
  });

  it("says the schedule is not up yet before the first publication", async () => {
    server.use(...signedIn());
    openApp(`/participate/${EVENT}/schedule`);
    expect(await screen.findByText("아직 일정표가 올라오지 않았어요. 올라오면 여기에 보여요.")).toBeInTheDocument();
  });

  it("says a day has no items", async () => {
    server.use(http.get("/api/v1/participant/schedule", () => HttpResponse.json(schedule({ items: [ITEMS[3]], removedItems: [] }))), ...signedIn());
    openApp(`/participate/${EVENT}/schedule`);
    expect(await screen.findByText("이날은 일정이 없어요.")).toBeInTheDocument();
  });

  it("reads again only when updates.schedule changes, and then shows the change", async () => {
    let version = 0;
    let reads = 0;
    server.use(http.get("/api/v1/participant/updates", () => HttpResponse.json({ ...UPDATES, schedule: version })),
      http.get("/api/v1/participant/schedule", () => {
        reads += 1;
        const moved = { ...ITEMS[0], change: { kind: "CHANGED", changedAt: UPDATES.serverTime, fields: ["place"], previous: { place: "대강당" } }, place: "소강당" };
        return HttpResponse.json(schedule({ items: version === 0 ? ITEMS : [moved, ...ITEMS.slice(1)] }));
      }),
      ...signedIn(),
    );
    openApp(`/participate/${EVENT}/schedule`);
    await screen.findByText("대강당");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Same updates value: no second read.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(reads).toBe(1);
    version = 1;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText("장소 대강당 → 소강당", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(reads).toBe(2);
  });
});

describe("지금·다음 card (C5)", () => {
  it("shows now and next and moves on when the current item ends, without reading again", async () => {
    let reads = 0;
    const ending = item({ title: "짧은 기도", startTime: "14:30", endTime: null, endsAt: "2027-01-22T14:30:13+09:00" });
    server.use(http.get("/api/v1/participant/schedule", () => {
        reads += 1;
        return HttpResponse.json(schedule({ items: [ending, ...ITEMS.slice(1)] }));
      }),
      ...signedIn(),
    );
    openApp(`/participate/${EVENT}`);
    const card = await screen.findByRole("region", { name: "지금·다음 일정" });
    expect(await within(card).findByText("짧은 기도")).toBeInTheDocument();
    expect(within(card).getByText("지금")).toBeInTheDocument();
    expect(within(card).getByText("저녁")).toBeInTheDocument();
    // The item ends a second after the server's clock; the card moves on by its own timer.
    await waitFor(() => expect(within(card).queryByText("짧은 기도")).not.toBeInTheDocument(), { timeout: 5000 });
    expect(within(card).queryByText("지금")).not.toBeInTheDocument();
    expect(within(card).getByText("다음")).toBeInTheDocument();
    expect(within(card).getByText("저녁")).toBeInTheDocument();
    expect(reads).toBe(1);
  }, 10000);

  it("says everything is over after the last item", async () => {
    server.use(http.get("/api/v1/participant/schedule", () => HttpResponse.json(schedule({ items: [item({ title: "아침", startTime: "08:00", endTime: "09:00" })] }))), ...signedIn());
    openApp(`/participate/${EVENT}`);
    const card = await screen.findByRole("region", { name: "지금·다음 일정" });
    expect(await within(card).findByText("일정이 모두 끝났어요.")).toBeInTheDocument();
  });
});
