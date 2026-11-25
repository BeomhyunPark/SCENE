import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { setLifecycle } from "../mocks/operatorStore";
import { submitPublicApplication } from "../mocks/participantStore";
import {
  assign,
  createGroup,
  deleteGroup,
  publish,
  readBoard,
  readGroupMember,
  readParticipantGroup,
  setLeaders,
  withdrawGroupParticipant,
} from "../mocks/groupStore";
import { server } from "../mocks/server";
import { setGroupRosterVisible } from "../mocks/participantSettingsStore";
import { readUpdates } from "../mocks/participantFeedStore";
import { participantHomeHandlers } from "../mocks/participantHomeTestHandlers";

const EVENT = localEvent.eventId;
const PUBLISHED = "2026-12-20T09:00:00.000Z";
const SECRET = "hidden-server-detail";

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: "urn:scene:problem:test", title: code, status, detail: SECRET, code },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function signedIn() {
  return [
    http.get("/api/v1/participant/me", () =>
      HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김민수" }),
    ),
    http.get("/api/v1/participant/check-in", () =>
      HttpResponse.json({ status: "NOT_STARTED", code: null, checkedIn: false, checkedInAt: null }),
    ),
    ...participantHomeHandlers(),
  ];
}

function group(body: Record<string, unknown>) {
  return http.get("/api/v1/participant/group", () =>
    HttpResponse.json({ status: "ASSIGNED", publishedAt: PUBLISHED, group: null, leader: false, members: null, ...body }),
  );
}

const ASSIGNED = {
  status: "ASSIGNED",
  group: { name: "1조", leaders: [{ name: "김하늘" }] },
};

const SLOTS = [
  ["opt_d1_dinner", 1, "2027-01-22", "1월 22일 (금)", "저녁"],
  ["opt_d1_worship", 1, "2027-01-22", "1월 22일 (금)", "집회"],
  ["opt_d2_breakfast", 2, "2027-01-23", "1월 23일 (토)", "아침"],
  ["opt_d2_lunch", 2, "2027-01-23", "1월 23일 (토)", "점심"],
  ["opt_d2_dinner", 2, "2027-01-23", "1월 23일 (토)", "저녁"],
  ["opt_d2_worship", 2, "2027-01-23", "1월 23일 (토)", "집회"],
  ["opt_d3_breakfast", 3, "2027-01-24", "1월 24일 (일)", "아침"],
  ["opt_d3_lunch", 3, "2027-01-24", "1월 24일 (일)", "점심"],
].map(([slotId, day, date, dayLabel, label], sortOrder) => ({ slotId, day, date, dayLabel, meal: "X", label, sortOrder }));
const ALL_SLOTS = SLOTS.map((slot) => slot.slotId);

/** 김민수 (me, leader) came; 이수진 comes 토 저녁 and was revised; 박지훈 has no slot answer. */
const LEADER = {
  status: "ASSIGNED",
  group: { name: "1조", leaders: [{ name: "김민수" }] },
  leader: true,
  rosterVisible: true,
  members: [
    { name: "김민수", cohort: "94", gender: "남", leader: true, me: true },
    { name: "이수진", cohort: "95", gender: "여", leader: false, me: false },
    { name: "박지훈", cohort: null, gender: null, leader: false, me: false },
  ],
  leaderView: {
    activeCount: 3,
    checkedInCount: 1,
    slots: SLOTS,
    members: [
      {
        participantId: "p-1",
        name: "김민수",
        cohort: "94",
        gender: "남",
        leader: true,
        checkIn: { checkedIn: true, checkedInAt: "2027-01-22T08:12:00Z" },
        attendance: { type: "FULL", arrivalSlotId: null, departureSlotId: null, slotIds: ALL_SLOTS, lodgingNights: [1, 2] },
        room: null,
        applicationRevisedAt: null,
      },
      {
        participantId: "p-2",
        name: "이수진",
        cohort: "95",
        gender: "여",
        leader: false,
        checkIn: { checkedIn: false, checkedInAt: null },
        attendance: {
          type: "PARTIAL",
          arrivalSlotId: "opt_d2_dinner",
          departureSlotId: "opt_d3_lunch",
          slotIds: ["opt_d2_dinner", "opt_d2_worship", "opt_d3_breakfast", "opt_d3_lunch"],
          lodgingNights: [2],
        },
        room: null,
        applicationRevisedAt: "2026-12-28T10:00:00Z",
      },
      {
        participantId: "p-3",
        name: "박지훈",
        cohort: null,
        gender: null,
        leader: false,
        checkIn: { checkedIn: false, checkedInAt: null },
        attendance: { type: "PARTIAL", arrivalSlotId: null, departureSlotId: null, slotIds: null, lodgingNights: null },
        room: null,
        applicationRevisedAt: null,
      },
    ],
  },
};

const DETAIL = {
  ...LEADER.leaderView.members[1],
  phone: "010-1234-5678",
  application: {
    submittedAt: "2026-12-16T03:00:00Z",
    revisedAt: "2026-12-28T10:00:00Z",
    revisedByOperator: false,
    answers: [
      { fieldId: "f-1", presetKey: "MIDDLE_GROUP", label: "중그룹", type: "DROPDOWN", display: "새가족 (등반X)", value: { optionId: "opt_new" }, operatorEdited: false },
      { fieldId: "f-2", presetKey: null, label: "도착 시각", type: "DATETIME", display: "2027. 1. 23. 19:00", value: {}, operatorEdited: true },
    ],
  },
};

function openForm() {
  const owner = localUsers[0].userId;
  const form = createForm(EVENT, owner, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, owner, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  return form;
}

/** The full 내 조 view is the 내 조 tab (#425); the home has a summary card. */
function openApp(path = `/participate/${EVENT}/group`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function groupRegion() {
  return screen.getByRole("region", { name: "내 조" });
}

describe("participant group", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the group and leader names with the publish time on the 내 조 tab", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    server.use(...signedIn(), group(ASSIGNED));
    openApp();
    expect(await screen.findByText("1조")).toBeInTheDocument();
    const region = groupRegion();
    expect(within(region).getByText("김민수님의 조")).toBeInTheDocument();
    expect(within(region).getByText(/조장/)).toHaveTextContent("조장김하늘");
    expect(within(region).getByText("12월 20일 18:00 기준")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /내 조/, current: "page" })).toBeInTheDocument();
    expect(local.mock.calls.flat().some((value) => String(value).includes("김하늘"))).toBe(false);
  });

  it("shows a member the roster with 또래 이름, 성별, 조장 and 나 marks and nothing to press", async () => {
    server.use(
      ...signedIn(),
      group({
        ...ASSIGNED,
        leader: false,
        rosterVisible: true,
        members: [
          { name: "김하늘", cohort: "94", gender: "여", leader: true, me: false },
          { name: "김민수", cohort: "95", gender: "남", leader: false, me: true },
          { name: "박지훈", cohort: null, gender: null, leader: false, me: false },
        ],
        leaderView: null,
      }),
    );
    openApp();
    const list = await screen.findByRole("list", { name: "우리 조 조원" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["94 김하늘여조장", "95 김민수남나", "박지훈"]);
    expect(within(groupRegion()).getByText("우리 조 3명")).toBeInTheDocument();
    // DEC-083 §1: members never open each other.
    expect(within(list).queryAllByRole("link")).toHaveLength(0);
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "조원 현황" })).not.toBeInTheDocument();
  });

  it("gives a member only the group and leader names while the roster switch is off", async () => {
    server.use(
      ...signedIn(),
      group({
        ...ASSIGNED,
        leader: false,
        rosterVisible: false,
        members: [{ name: "이수진", cohort: "95", gender: "여", leader: false, me: false }],
      }),
    );
    openApp();
    await screen.findByText("1조");
    expect(within(groupRegion()).getByText(/조장/)).toHaveTextContent("조장김하늘");
    expect(screen.queryByRole("list", { name: "우리 조 조원" })).not.toBeInTheDocument();
    expect(screen.queryByText(/이수진/)).not.toBeInTheDocument();
  });

  it("shows a leader 조원 현황: 미도착 first, every member with arrival, and 식사별 인원", async () => {
    server.use(...signedIn(), group(LEADER));
    openApp();
    const status = await screen.findByRole("region", { name: "조원 현황" });
    expect(within(status).getByLabelText("도착 1명, 전체 3명")).toHaveTextContent("도착 1 / 3명");
    const absent = within(status).getByRole("list", { name: "미도착 조원" });
    expect(within(absent).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "95 이수진1월 23일 (토) 저녁 ~ 1월 24일 (일) 점심",
      "박지훈",
    ]);
    const all = within(status).getByRole("list", { name: "우리 조 조원" });
    expect(within(all).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "94 김민수남조장나도착 17:12",
      "95 이수진여최근 수정미도착",
      "박지훈미도착",
    ]);
    const slots = within(status).getByLabelText("식사별 조 인원");
    expect(within(slots).getAllByRole("definition").map((item) => item.textContent)).toEqual([
      "저녁 1 · 집회 1",
      "아침 1 · 점심 1 · 저녁 2 · 집회 2",
      "아침 2 · 점심 2",
    ]);
    expect(within(status).getAllByText("참석 칸을 모르는 조원 1명은 세지 않았어요.").length).toBeGreaterThan(0);
  });

  it("opens a member once with a call link, the server's answer text and 최근 수정", async () => {
    let reads = 0;
    server.use(
      ...signedIn(),
      group(LEADER),
      http.get("/api/v1/participant/group/members/:id", ({ params }) => {
        reads += 1;
        expect(params.id).toBe("p-2");
        return HttpResponse.json(DETAIL, { headers: { "Cache-Control": "no-store" } });
      }),
    );
    openApp();
    const absent = await screen.findByRole("list", { name: "미도착 조원" });
    fireEvent.click(within(absent).getAllByRole("link")[0]);
    const detail = await screen.findByRole("region", { name: "조원 상세" });
    expect(await within(detail).findByText("95 이수진")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /전화 걸기 010-1234-5678/ })).toHaveAttribute("href", "tel:01012345678");
    expect(within(detail).getByText(/최근 수정 12월 28일 19:00/)).toBeInTheDocument();
    expect(within(detail).getByText("2027. 1. 23. 19:00")).toBeInTheDocument();
    expect(within(detail).getByText("새가족 (등반X)")).toBeInTheDocument();
    expect(within(detail).getByText("운영자가 고침")).toBeInTheDocument();
    expect(within(detail).getByText("부분 참석 · 1월 23일 (토) 저녁 ~ 1월 24일 (일) 점심")).toBeInTheDocument();
    expect(within(detail).getByText("2일째 밤")).toBeInTheDocument();
    expect(within(detail).queryByText("방")).not.toBeInTheDocument();
    expect(reads).toBe(1);

    fireEvent.click(within(detail).getByRole("link", { name: "조원 현황으로" }));
    await screen.findByRole("region", { name: "조원 현황" });
    fireEvent.click(within(groupRegion()).getByRole("button", { name: "새로 고침" }));
    await screen.findByRole("list", { name: "미도착 조원" });
    expect(reads).toBe(1);
    fireEvent.click(within(screen.getByRole("list", { name: "미도착 조원" })).getAllByRole("link")[0]);
    await screen.findByRole("link", { name: /전화 걸기/ });
    // Each opening reads (and is logged by the server) again; nothing is kept in between.
    expect(reads).toBe(2);
  });

  it("says one sentence when the member cannot be opened", async () => {
    server.use(
      ...signedIn(),
      group(LEADER),
      http.get("/api/v1/participant/group/members/:id", () => problem(404, "RESOURCE_NOT_FOUND")),
    );
    openApp(`/participate/${EVENT}/group/members/someone-else`);
    const detail = await screen.findByRole("region", { name: "조원 상세" });
    expect(await within(detail).findByText("볼 수 없어요.")).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("shows the room only when the server sends one", async () => {
    server.use(
      ...signedIn(),
      group(LEADER),
      http.get("/api/v1/participant/group/members/:id", () =>
        HttpResponse.json({ ...DETAIL, room: { name: "201호", locationNote: "본관 2층" } }),
      ),
    );
    openApp(`/participate/${EVENT}/group/members/p-2`);
    expect(await screen.findByText("201호 · 본관 2층")).toBeInTheDocument();
  });

  it("reads 조원 현황 again every 60 seconds, and a member's 내 조 does not", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let reads = 0;
      let body: Record<string, unknown> = LEADER;
      server.use(
        ...signedIn(),
        http.get("/api/v1/participant/group", () => {
          reads += 1;
          return HttpResponse.json({ publishedAt: PUBLISHED, ...body });
        }),
      );
      openApp();
      await screen.findByRole("region", { name: "조원 현황" });
      expect(reads).toBe(1);
      await vi.advanceTimersByTimeAsync(61_000);
      await vi.waitFor(() => expect(reads).toBe(2));
      body = { ...ASSIGNED, leader: false, rosterVisible: true, members: [], leaderView: null };
      await vi.advanceTimersByTimeAsync(61_000);
      await vi.waitFor(() => expect(reads).toBe(3));
      await screen.findByText("우리 조 0명");
      await vi.advanceTimersByTimeAsync(130_000);
      expect(reads).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains a publication without my group", async () => {
    server.use(...signedIn(), group({ status: "UNASSIGNED", group: null }));
    openApp();
    expect(await screen.findByText("아직 조가 정해지지 않았어요")).toBeInTheDocument();
    expect(within(groupRegion()).getByText("12월 20일 18:00 기준")).toBeInTheDocument();
  });

  it("explains that groups are not published yet", async () => {
    server.use(...signedIn(), group({ status: "NOT_PUBLISHED", publishedAt: null, group: null }));
    openApp();
    expect(await screen.findByText("조 안내가 아직 열리지 않았어요")).toBeInTheDocument();
    expect(within(groupRegion()).queryByText(/기준$/)).not.toBeInTheDocument();
  });

  it("shows the summary card after the arrival QR on home and opens the 내 조 tab", async () => {
    server.use(...signedIn(), group(ASSIGNED));
    openApp(`/participate/${EVENT}`);
    const card = await screen.findByRole("region", { name: "내 조" });
    expect(await within(card).findByText("1조")).toBeInTheDocument();
    expect(within(card).getByText("조장 김하늘")).toBeInTheDocument();
    const arrival = screen.getByRole("region", { name: "도착 확인" });
    expect(arrival.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(card).getByRole("link", { name: "내 조 자세히 보기" }));
    expect(await screen.findByText("김민수님의 조")).toBeInTheDocument();
  });

  it("hides the group area for a withdrawn application", async () => {
    server.use(...signedIn(), group({ status: "NOT_ELIGIBLE", publishedAt: null, group: null }));
    openApp(`/participate/${EVENT}`);
    await screen.findByRole("region", { name: "도착 확인" });
    await screen.findByText("행사가 시작되면 열립니다.");
    await vi.waitFor(() => expect(screen.queryByText("내 조를 불러오는 중이에요.")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "내 조" })).not.toBeInTheDocument();
  });

  it("picks up a republished group on refresh", async () => {
    let name = "1조";
    server.use(
      ...signedIn(),
      http.get("/api/v1/participant/group", () =>
        HttpResponse.json({ ...ASSIGNED, publishedAt: PUBLISHED, group: { name, leaders: [] }, leader: false, members: null }),
      ),
    );
    openApp();
    await screen.findByText("1조");
    expect(within(groupRegion()).getByText("조장은 아직 정해지지 않았어요")).toBeInTheDocument();
    name = "2조";
    fireEvent.click(within(groupRegion()).getByRole("button", { name: "새로 고침" }));
    expect(await screen.findByText("2조")).toBeInTheDocument();
  });

  it("lets the participant retry a failed load and keeps the group when a reload fails", async () => {
    let fail = true;
    server.use(
      ...signedIn(),
      http.get("/api/v1/participant/group", () =>
        fail ? HttpResponse.error() : HttpResponse.json({ ...ASSIGNED, publishedAt: PUBLISHED, leader: false, members: null }),
      ),
    );
    openApp();
    expect(await screen.findByText("내 조를 불러오지 못했어요.", {}, { timeout: 3000 })).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(groupRegion()).getByRole("button", { name: "새로 고침" }));
    expect(await screen.findByText("1조")).toBeInTheDocument();
    fail = true;
    fireEvent.click(within(groupRegion()).getByRole("button", { name: "새로 고침" }));
    expect(await screen.findByText(/최신 조를 불러오지 못했어요/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("1조")).toBeInTheDocument();
  });

  it("goes back to the sign-in screen on 401 without showing server detail", async () => {
    let inside = true;
    server.use(
      http.get("/api/v1/participant/me", () =>
        inside ? HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김민수" }) : problem(401, "AUTHENTICATION_REQUIRED"),
      ),
      http.get("/api/v1/participant/group", () => {
        inside = false;
        return problem(401, "AUTHENTICATION_REQUIRED");
      }),
      ...signedIn(),
    );
    openApp();
    expect(await screen.findByRole("heading", { name: "내 신청 보기" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });
});

describe("participant group mock", () => {
  it("follows the server order and gives members only to a leader", async () => {
    const form = openForm();
    const ids = ["가", "나", "다"].map((name, index) => {
      const answers = form.fields.flatMap((field) => {
        if (field.systemKey === "NAME") return [{ fieldId: field.fieldId, text: name }];
        if (field.systemKey === "PHONE") return [{ fieldId: field.fieldId, text: `010-1234-567${index}` }];
        return [];
      });
      const issued = submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
      if ("code" in issued) throw new Error(issued.code);
      return issued.participantId;
    });
    expect(readParticipantGroup(EVENT, ids[0])).toMatchObject({ status: "NOT_PUBLISHED", publishedAt: null, group: null });
    expect(readParticipantGroup(EVENT, "missing")).toMatchObject({ status: "NOT_ELIGIBLE" });

    // The operator side of the same store (#302): one group, 가 leader, 다 left unassigned.
    const owner = localUsers[0].userId;
    const created = createGroup(EVENT, owner, { name: "1조" });
    if (!("group" in created)) throw new Error("group");
    const groupId = created.group.groupId;
    assign(EVENT, owner, { changes: ids.slice(0, 2).map((participantId) => ({ participantId, fromGroupId: null, toGroupId: groupId })) });
    setLeaders(EVENT, groupId, owner, { participantIds: [ids[0]], expectedVersion: 0 });
    const version = readBoard(EVENT, owner);
    if (!("boardVersion" in version)) throw new Error("board");
    expect(publish(EVENT, owner, { expectedBoardVersion: version.boardVersion }, new Date(PUBLISHED))).toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    expect(readParticipantGroup(EVENT, ids[0])).toMatchObject({ status: "NOT_PUBLISHED" });
    publish(EVENT, owner, { expectedBoardVersion: version.boardVersion, confirmUnassigned: true }, new Date(PUBLISHED));

    const leader = readParticipantGroup(EVENT, ids[0]);
    expect(leader).toMatchObject({ status: "ASSIGNED", publishedAt: PUBLISHED, leader: true, group: { name: "1조" } });
    expect(leader.members?.map((member) => member.name)).toEqual(["가", "나"]);
    // DEC-083: a member gets the roster (switch on by default) but no leaderView.
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({
      leader: false,
      rosterVisible: true,
      leaderView: null,
      group: { leaders: [{ name: "가" }] },
      members: [
        { name: "가", leader: true, me: false },
        { name: "나", leader: false, me: true },
      ],
    });
    expect(leader.leaderView?.members.map((member) => member.participantId)).toEqual(ids.slice(0, 2));
    expect(readGroupMember(EVENT, ids[0], ids[1])).toMatchObject({ participantId: ids[1], name: "나" });
    expect(readGroupMember(EVENT, ids[1], ids[0])).toBeNull();
    expect(readGroupMember(EVENT, ids[0], ids[2])).toBeNull();
    const feedBefore = readUpdates(EVENT, ids[1]).group;
    setGroupRosterVisible(EVENT, false);
    expect(readUpdates(EVENT, ids[1]).group).toBe(feedBefore + 1);
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({ rosterVisible: false, members: null });
    expect(readParticipantGroup(EVENT, ids[0])).toMatchObject({ rosterVisible: true, leader: true });
    setGroupRosterVisible(EVENT, true);
    expect(readParticipantGroup(EVENT, ids[2])).toMatchObject({ status: "UNASSIGNED", publishedAt: PUBLISHED, group: null });

    withdrawGroupParticipant(EVENT, ids[0]);
    expect(readParticipantGroup(EVENT, ids[0])).toMatchObject({ status: "NOT_ELIGIBLE", publishedAt: null });
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({ group: { leaders: [] } });

    // Working-copy changes stay hidden until the next publish.
    deleteGroup(EVENT, groupId, owner, new URL(`http://x/?expectedVersion=1`));
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({ status: "ASSIGNED", group: { name: "1조" } });
    const next = readBoard(EVENT, owner);
    if (!("boardVersion" in next)) throw new Error("board");
    publish(EVENT, owner, { expectedBoardVersion: next.boardVersion, confirmUnassigned: true });
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({ status: "UNASSIGNED" });
  });
});
