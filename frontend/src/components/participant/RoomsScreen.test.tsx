import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { createForm, setAccepting } from "../../mocks/formStore";
import { setLifecycle } from "../../mocks/operatorStore";
import { homeBody, SCHEDULE_NOT_PUBLISHED, UPDATES, EMPTY_NOTICES } from "../../mocks/participantHomeTestHandlers";
import { publishParticipantRooms, setNotLodging, setRoomRosterScope } from "../../mocks/participantRoomStore";
import { submitPublicApplication } from "../../mocks/participantStore";
import { server } from "../../mocks/server";

const EVENT = localEvent.eventId;

/** Shaped like api.md "숙소" `GET /participant/rooms`, plus keys the screen must never show. */
function assigned(overrides: Record<string, unknown> = {}) {
  return {
    status: "ASSIGNED",
    publishedAt: "2027-01-10T09:00:00Z",
    rosterScope: "ALL",
    notLodging: false,
    myRoom: {
      roomId: "room-301",
      name: "301호",
      locationNote: "본관 3층 계단 옆",
      genderLabel: "남성",
      members: [
        { name: "김", cohort: "94", gender: "남성", me: true, participantId: "secret-p1", phone: "010-1111-2222" },
        { name: "박", cohort: "95", gender: "남성", me: false, participantId: "secret-p2", phone: "010-3333-4444" },
        { name: "이", cohort: null, gender: null, me: false },
      ],
    },
    rooms: [
      {
        roomId: "room-301",
        name: "301호",
        locationNote: "본관 3층 계단 옆",
        genderLabel: "남성",
        members: [{ name: "김", cohort: "94" }, { name: "박", cohort: "95", participantId: "secret-p2" }, { name: "이", cohort: null }],
      },
      { roomId: "room-302", name: "302호", locationNote: null, genderLabel: "여성", members: [{ name: "최", cohort: "01" }] },
      { roomId: "room-303", name: "303호", locationNote: null, genderLabel: null, members: [] },
    ],
    ...overrides,
  };
}

function shell(rooms: unknown | (() => unknown), updates: () => Record<string, unknown> = () => UPDATES) {
  return [
    http.get("/api/v1/participant/me", () => HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김" })),
    http.get("/api/v1/participant/home", () => HttpResponse.json(homeBody())),
    http.get("/api/v1/participant/updates", () => HttpResponse.json(updates())),
    http.get("/api/v1/participant/schedule", () => HttpResponse.json(SCHEDULE_NOT_PUBLISHED)),
    EMPTY_NOTICES,
    http.get("/api/v1/participant/check-in", () => HttpResponse.json({ status: "NOT_STARTED", code: null, checkedIn: false, checkedInAt: null })),
    http.get("/api/v1/participant/group", () =>
      HttpResponse.json({ status: "NOT_PUBLISHED", publishedAt: null, group: null, leader: false, members: null }),
    ),
    http.get("/api/v1/participant/rooms", () => HttpResponse.json((typeof rooms === "function" ? (rooms as () => unknown)() : rooms) as JsonBodyType)),
  ];
}

function openApp(path = `/participate/${EVENT}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function expectNoPrivateValues() {
  expect(document.body.textContent).not.toMatch(/secret-p|010-|room-30/);
}

describe("숙소 card and screen (#459, DEC-085)", () => {
  it("shows my room, location and the other people in it on the home card", async () => {
    server.use(...shell(assigned()));
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    expect(await within(card).findByText("301호")).toBeInTheDocument();
    expect(within(card).getByText("본관 3층 계단 옆 · 남성 방")).toBeInTheDocument();
    const mates = within(card).getByRole("list", { name: "같은 방 사람" });
    expect(within(mates).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["박 · 95 · 남성", "이"]);
    expect(within(card).getByRole("link", { name: "전체 방 배정표" })).toHaveAttribute("href", `/participate/${EVENT}/rooms#room-roster`);
    expect(within(card).getByRole("link", { name: "숙소 자세히 보기" })).toHaveAttribute("href", `/participate/${EVENT}/rooms`);
    expectNoPrivateValues();
  });

  it("shows five roommates on the card and counts the rest", async () => {
    const members = [{ name: "가", cohort: "90", gender: null, me: true }].concat(
      ["나", "다", "라", "마", "바", "사", "아"].map((name) => ({ name, cohort: "90", gender: null, me: false })),
    );
    server.use(...shell(assigned({ myRoom: { ...assigned().myRoom, members } })));
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    const mates = await within(card).findByRole("list", { name: "같은 방 사람" });
    expect(within(mates).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "나 · 90",
      "다 · 90",
      "라 · 90",
      "마 · 90",
      "바 · 90",
      "외 2명",
    ]);
  });

  it("opens the 숙소 screen under the home tab with my room and the full table", async () => {
    server.use(...shell(assigned()));
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    fireEvent.click(await within(card).findByRole("link", { name: "숙소 자세히 보기" }));
    expect(await screen.findByRole("heading", { name: "숙소", level: 1 })).toBeInTheDocument();
    // No sixth tab: the screen belongs to 홈.
    const nav = screen.getByRole("navigation", { name: "참가자 메뉴" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: "홈", current: "page" })).toBeInTheDocument();

    const people = screen.getByRole("list", { name: "같은 방 사람" });
    expect(within(people).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["김 · 94 · 남성나", "박 · 95 · 남성", "이"]);
    expect(screen.getByRole("heading", { name: "같은 방 3명" })).toBeInTheDocument();

    const roster = screen.getByRole("region", { name: /전체 방 배정표/ });
    const mine = within(roster).getByRole("listitem", { name: "301호 (내 방)" });
    expect(within(mine).getByText("김 · 94, 박 · 95, 이")).toBeInTheDocument();
    const other = within(roster).getByRole("listitem", { name: "302호" });
    expect(within(other).getByText("여성 방")).toBeInTheDocument();
    expect(within(other).getByText("최 · 01")).toBeInTheDocument();
    // The full table has names and 또래 only, no gender per person.
    expect(within(other).queryByText(/최 · 01 · /)).not.toBeInTheDocument();
    expect(within(within(roster).getByRole("listitem", { name: "303호" })).getByText("아직 배정된 사람이 없어요.")).toBeInTheDocument();
    expectNoPrivateValues();
  });

  it("has no full table with the ROOMMATES scope", async () => {
    server.use(...shell(assigned({ rosterScope: "ROOMMATES", rooms: null })));
    openApp(`/participate/${EVENT}/rooms`);
    expect(await screen.findByRole("list", { name: "같은 방 사람" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /전체 방 배정표/ })).not.toBeInTheDocument();
    expect(screen.queryByText("전체 방 배정표")).not.toBeInTheDocument();
  });

  it("keeps a full table out even if the server sent one with a narrower scope", async () => {
    server.use(...shell(assigned({ rosterScope: "ROOMMATES" })));
    openApp(`/participate/${EVENT}/rooms`);
    expect(await screen.findByRole("list", { name: "같은 방 사람" })).toBeInTheDocument();
    expect(screen.queryByText("302호")).not.toBeInTheDocument();
  });

  it("shows only my room's name and location with the MY_ROOM scope", async () => {
    server.use(...shell(assigned({ rosterScope: "MY_ROOM", rooms: null, myRoom: { ...assigned().myRoom, members: null } })));
    openApp(`/participate/${EVENT}/rooms`);
    expect(await screen.findByText("301호")).toBeInTheDocument();
    expect(screen.getByText("본관 3층 계단 옆 · 남성 방")).toBeInTheDocument();
    expect(screen.queryByText(/박/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "같은 방 사람" })).not.toBeInTheDocument();
    expect(screen.queryByText(/전체 방 배정표/)).not.toBeInTheDocument();
  });

  it("says rooms are not published yet", async () => {
    server.use(...shell({ status: "NOT_PUBLISHED", publishedAt: null, rosterScope: "ALL", notLodging: false, myRoom: null, rooms: null }));
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    expect(await within(card).findByText("숙소가 정해지면 여기에 보여요.")).toBeInTheDocument();
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
  });

  it("says the room is being decided when published without my room, and still offers the table", async () => {
    server.use(...shell(assigned({ status: "UNASSIGNED", myRoom: null })));
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    expect(await within(card).findByText("숙소를 정하고 있어요. 방이 정해지면 여기에 보여요.")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("link", { name: "전체 방 배정표" }));
    expect(await screen.findByRole("region", { name: /전체 방 배정표/ })).toBeInTheDocument();
    expect(screen.getByText("숙소를 정하고 있어요. 방이 정해지면 여기에 보여요.")).toBeInTheDocument();
    expect(screen.queryByText("내 방", { selector: ".participant-room__badge" })).not.toBeInTheDocument();
  });

  it("tells a person who does not stay overnight that there is no room", async () => {
    server.use(...shell(assigned({ status: "UNASSIGNED", myRoom: null, notLodging: true, rosterScope: "ROOMMATES", rooms: null })));
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    expect(await within(card).findByText("숙박하지 않는 것으로 신청했어요. 배정된 방이 없어요.")).toBeInTheDocument();
  });

  it("still shows a room left after the person stopped staying overnight, with a note", async () => {
    server.use(...shell(assigned({ notLodging: true })));
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    expect(await within(card).findByText("301호")).toBeInTheDocument();
    expect(within(card).getByText(/숙박하지 않는 것으로 신청했지만 방이 배정되어 있어요/)).toBeInTheDocument();
  });

  it("has no card for NOT_ELIGIBLE and says why on the screen", async () => {
    server.use(...shell({ status: "NOT_ELIGIBLE", publishedAt: null, rosterScope: "ALL", notLodging: false, myRoom: null, rooms: null }));
    openApp(`/participate/${EVENT}/rooms`);
    expect(await screen.findByText("신청이 접수된 참가자에게 숙소가 보여요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "← 홈" }));
    await screen.findByRole("region", { name: "행사" });
    expect(screen.queryByRole("region", { name: "숙소" })).not.toBeInTheDocument();
  });

  it("reads rooms again only when updates.rooms changes", async () => {
    let rooms: unknown = { status: "NOT_PUBLISHED", publishedAt: null, rosterScope: "ALL", notLodging: false, myRoom: null, rooms: null };
    let roomsVersion = 0;
    let roomReads = 0;
    let scheduleReads = 0;
    server.use(
      ...shell(
        () => {
          roomReads += 1;
          return rooms;
        },
        () => ({ ...UPDATES, rooms: roomsVersion }),
      ),
      http.get("/api/v1/participant/schedule", () => {
        scheduleReads += 1;
        return HttpResponse.json(SCHEDULE_NOT_PUBLISHED);
      }),
    );
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    await within(card).findByText("숙소가 정해지면 여기에 보여요.");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(roomReads).toBe(1);

    const schedule = scheduleReads;
    rooms = assigned();
    roomsVersion = 1;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await within(card).findByText("301호", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(roomReads).toBe(2);
    expect(scheduleReads).toBe(schedule);
  });
});

describe("숙소 on the mock server", () => {
  function apply(name: string) {
    const owner = localUsers[0].userId;
    const form = createForm(EVENT, owner, {});
    if ("code" in form) throw new Error(form.code);
    setLifecycle(EVENT, "ACTIVE", 1);
    setAccepting(EVENT, form.formId, owner, { acceptingApplications: true });
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

  it("shows the published room and roommates after the next updates check, and follows a scope change", async () => {
    const me = apply("김민수");
    openApp();
    expect(await screen.findByText("Local event")).toBeInTheDocument();
    // A local event with no type has rooms off until a room publication exists.
    expect(screen.queryByRole("region", { name: "숙소" })).not.toBeInTheDocument();

    publishParticipantRooms(EVENT, [
      {
        roomId: "r1",
        name: "301호",
        locationNote: "본관 3층",
        genderLabel: null,
        members: [
          { participantId: me, name: "김민수", cohort: "94", gender: "남성" },
          { participantId: "other", name: "박지훈", cohort: "95", gender: "남성" },
        ],
      },
      { roomId: "r2", name: "302호", members: [{ participantId: "third", name: "최", cohort: "01", gender: "여성" }] },
    ]);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const card = await screen.findByRole("region", { name: "숙소" }, { timeout: 4000 });
    expect(await within(card).findByText("301호")).toBeInTheDocument();
    expect(within(card).getByText("박지훈 · 95 · 남성")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "전체 방 배정표" })).toBeInTheDocument();

    setRoomRosterScope(EVENT, "MY_ROOM");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await within(card).findByText("301호");
    await screen.findByText("본관 3층");
    await waitForGone(() => within(card).queryByText("박지훈 · 95 · 남성"));
    expect(within(card).queryByRole("link", { name: "전체 방 배정표" })).not.toBeInTheDocument();
  });

  it("answers UNASSIGNED with notLodging for a person not staying overnight", async () => {
    const me = apply("김민수");
    setNotLodging(EVENT, me, true);
    publishParticipantRooms(EVENT, [{ roomId: "r1", name: "301호", members: [] }]);
    openApp();
    const card = await screen.findByRole("region", { name: "숙소" });
    expect(await within(card).findByText("숙박하지 않는 것으로 신청했어요. 배정된 방이 없어요.")).toBeInTheDocument();
  });
});

async function waitForGone(query: () => HTMLElement | null) {
  const until = Date.now() + 4000;
  while (query() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 25));
  expect(query()).toBeNull();
}
