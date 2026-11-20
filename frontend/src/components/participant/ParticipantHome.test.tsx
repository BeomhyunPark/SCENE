import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { createForm, setAccepting } from "../../mocks/formStore";
import { assign, createGroup, publish, readBoard } from "../../mocks/groupStore";
import { setLifecycle } from "../../mocks/operatorStore";
import { submitPublicApplication } from "../../mocks/participantStore";
import { server } from "../../mocks/server";
import { homeBody, UPDATES } from "../../mocks/participantHomeTestHandlers";

const EVENT = localEvent.eventId;

function me() {
  return http.get("/api/v1/participant/me", () =>
    HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김" }),
  );
}

function cards() {
  return [
    http.get("/api/v1/participant/check-in", () =>
      HttpResponse.json({ status: "NOT_STARTED", code: null, checkedIn: false, checkedInAt: null }),
    ),
    http.get("/api/v1/participant/group", () =>
      HttpResponse.json({ status: "ASSIGNED", publishedAt: null, group: { name: "1조", leaders: [{ name: "김하늘" }] }, leader: false, members: null }),
    ),
    http.get("/api/v1/participant/updates", () => HttpResponse.json(UPDATES)),
  ];
}

function home(overrides: Parameters<typeof homeBody>[0] = {}) {
  return http.get("/api/v1/participant/home", () => HttpResponse.json(homeBody(overrides)));
}

function openApp(path = `/participate/${EVENT}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function tabNames() {
  const nav = screen.getByRole("navigation", { name: "참가자 메뉴" });
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.textContent);
}

function cardTitles() {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
}

describe("participant home (#425)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the five tabs in order and every card when every area is on", async () => {
    server.use(me(), home(), ...cards());
    openApp();
    expect(await screen.findByText("2027 청년부 겨울수련회")).toBeInTheDocument();
    expect(tabNames()).toEqual(["홈", "일정", "공지", "내 조", "내 정보"]);
    expect(screen.getByRole("link", { name: "홈", current: "page" })).toBeInTheDocument();
    expect(cardTitles()).toEqual(["행사", "지금·다음 일정", "최신 공지", "도착 QR", "내 조", "숙소", "다음 식사"]);
    expect(screen.getByText("2027년 1월 22일 – 2027년 1월 24일 · 양평 수양관")).toBeInTheDocument();
    expect(screen.getByText("일정이 올라오면 여기에 보여요.")).toBeInTheDocument();
    expect(screen.getByText("공지가 올라오면 여기에 보여요.")).toBeInTheDocument();
    expect(screen.queryByText("행사가 끝났어요")).not.toBeInTheDocument();
  });

  it("leaves out the tabs and cards of areas that are off", async () => {
    server.use(me(), home({ features: { groups: false, rooms: false, mealOrder: false, notices: false } }), ...cards());
    openApp();
    await screen.findByText("2027 청년부 겨울수련회");
    expect(tabNames()).toEqual(["홈", "일정", "내 정보"]);
    expect(cardTitles()).toEqual(["행사", "지금·다음 일정", "도착 QR"]);
  });

  it("keeps each tab on its own address and sends an off area home", async () => {
    server.use(me(), home({ features: { notices: false } }), ...cards());
    openApp(`/participate/${EVENT}/schedule`);
    expect(await screen.findByRole("heading", { name: "일정", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "일정", current: "page" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "내 조" }));
    expect(await screen.findByText("김님의 조")).toBeInTheDocument();
  });

  it("opens home instead of a tab whose area is off", async () => {
    server.use(me(), home({ features: { notices: false } }), ...cards());
    openApp(`/participate/${EVENT}/notices/some-notice`);
    expect(await screen.findByText("2027 청년부 겨울수련회")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈", current: "page" })).toBeInTheDocument();
  });

  it("says an ended event is over and folds the completion notice", async () => {
    server.use(
      me(),
      home({ event: { status: "ENDED" }, completionNotice: "참가비 3만원\n<b>계좌</b>" }),
      ...cards(),
    );
    openApp();
    expect(await screen.findByText("행사가 끝났어요")).toBeInTheDocument();
    const summary = screen.getByText("신청 안내 보기");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText(/<b>계좌<\/b>/)).toBeInTheDocument();
  });

  it("marks only the card whose reload failed", async () => {
    let groupFails = false;
    server.use(
      me(),
      home(),
      http.get("/api/v1/participant/group", () =>
        groupFails
          ? HttpResponse.json({ code: "UNEXPECTED" }, { status: 503 })
          : HttpResponse.json({ status: "ASSIGNED", publishedAt: null, group: { name: "1조", leaders: [] }, leader: false, members: null }),
      ),
      http.get("/api/v1/participant/updates", () => HttpResponse.json({ ...UPDATES, group: groupFails ? 1 : 0 })),
      ...cards(),
    );
    openApp();
    const card = await screen.findByRole("region", { name: "내 조" });
    await within(card).findByText("1조");
    groupFails = true;
    // Coming back to the page checks updates at once; the group value changed, so only 내 조 reloads.
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await within(card).findByText("갱신 실패", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(within(card).getByText("1조")).toBeInTheDocument();
    expect(screen.getAllByText("갱신 실패")).toHaveLength(1);
    expect(screen.getByText("행사가 시작되면 열립니다.")).toBeInTheDocument();
  });

  it("still shows the always-on tabs and cards when home fails", async () => {
    server.use(me(), http.get("/api/v1/participant/home", () => HttpResponse.json({ code: "UNEXPECTED" }, { status: 500 })), ...cards());
    openApp();
    expect(await screen.findByText("행사 정보를 불러오지 못했어요.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(tabNames()).toEqual(["홈", "내 정보"]);
    expect(screen.getByRole("region", { name: "도착 QR" })).toBeInTheDocument();
  });

  it("does not read a card again on window focus", async () => {
    let groupReads = 0;
    server.use(
      me(),
      home(),
      http.get("/api/v1/participant/group", () => {
        groupReads += 1;
        return HttpResponse.json({ status: "NOT_PUBLISHED", publishedAt: null, group: null, leader: false, members: null });
      }),
      ...cards(),
    );
    openApp();
    await screen.findByText("조가 공개되면 여기에 보여요.");
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(groupReads).toBe(1);
  });
});

describe("participant home on the mock server", () => {
  it("shows a published group after the next updates check", async () => {
    const owner = localUsers[0].userId;
    const form = createForm(EVENT, owner, {});
    if ("code" in form) throw new Error(form.code);
    setLifecycle(EVENT, "ACTIVE", 1);
    setAccepting(EVENT, form.formId, owner, { acceptingApplications: true });
    const answers = form.fields.flatMap((field) => {
      if (field.systemKey === "NAME") return [{ fieldId: field.fieldId, text: "김민수" }];
      if (field.systemKey === "PHONE") return [{ fieldId: field.fieldId, text: "010-2222-3333" }];
      if (field.systemKey === "COHORT") return [{ fieldId: field.fieldId, text: "94" }];
      return [];
    });
    const issued = submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
    if ("code" in issued) throw new Error(issued.code);
    openApp();
    expect(await screen.findByText("Local event")).toBeInTheDocument();
    // A local event with no type turns only 일정·공지 on; groups appear once published.
    expect(tabNames()).toEqual(["홈", "일정", "공지", "내 정보"]);

    const created = createGroup(EVENT, owner, { name: "3조" });
    if (!("group" in created)) throw new Error("group");
    assign(EVENT, owner, { changes: [{ participantId: issued.participantId, fromGroupId: null, toGroupId: created.group.groupId }] });
    const board = readBoard(EVENT, owner);
    if (!("boardVersion" in board)) throw new Error("board");
    expect(publish(EVENT, owner, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true })).toMatchObject({ result: "PUBLISHED" });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const card = await screen.findByRole("region", { name: "내 조" });
    expect(await within(card).findByText("3조")).toBeInTheDocument();
    expect(tabNames()).toEqual(["홈", "일정", "공지", "내 조", "내 정보"]);
  });
});
