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
  publishMockGroupsFromApplicants,
  publishParticipantGroups,
  readParticipantGroup,
  withdrawFromGroups,
} from "../mocks/participantGroupStore";
import { server } from "../mocks/server";

const EVENT = localEvent.eventId;
const PUBLISHED = "2026-12-20T09:00:00Z";
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

function openForm() {
  const owner = localUsers[0].userId;
  const form = createForm(EVENT, owner, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, owner, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  return form;
}

function openApp() {
  return render(
    <MemoryRouter initialEntries={[`/participate/${EVENT}`]}>
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

  it("shows the group and leader names with the publish time, after the arrival area", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    server.use(...signedIn(), group(ASSIGNED));
    openApp();
    expect(await screen.findByText("1조")).toBeInTheDocument();
    const region = groupRegion();
    expect(within(region).getByText("김민수님의 조")).toBeInTheDocument();
    expect(within(region).getByText(/조장/)).toHaveTextContent("조장김하늘");
    expect(within(region).getByText("12월 20일 18:00 기준")).toBeInTheDocument();
    const arrival = screen.getByRole("region", { name: "도착 확인" });
    expect(arrival.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(local.mock.calls.flat().some((value) => String(value).includes("김하늘"))).toBe(false);
  });

  it("gives a regular member no roster even if the server sent one", async () => {
    server.use(
      ...signedIn(),
      group({ ...ASSIGNED, leader: false, members: [{ name: "이수진", cohort: "95", leader: false }] }),
    );
    openApp();
    await screen.findByText("1조");
    expect(screen.queryByRole("list", { name: "우리 조 조원" })).not.toBeInTheDocument();
    expect(screen.queryByText(/이수진/)).not.toBeInTheDocument();
  });

  it("shows a leader the members as 또래 이름 with the leader mark", async () => {
    server.use(
      ...signedIn(),
      group({
        ...ASSIGNED,
        group: { name: "1조", leaders: [{ name: "김민수" }] },
        leader: true,
        members: [
          { name: "김민수", cohort: "94", leader: true },
          { name: "이수진", cohort: "95", leader: false },
          { name: "박지훈", cohort: null, leader: false },
        ],
      }),
    );
    openApp();
    const list = await screen.findByRole("list", { name: "우리 조 조원" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["94 김민수조장", "95 이수진", "박지훈"]);
    expect(within(groupRegion()).getByText("우리 조 3명")).toBeInTheDocument();
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

  it("hides the group area for a withdrawn application", async () => {
    server.use(...signedIn(), group({ status: "NOT_ELIGIBLE", publishedAt: null, group: null }));
    openApp();
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

  it("asks for the link again on 401 without showing server detail", async () => {
    server.use(...signedIn(), http.get("/api/v1/participant/group", () => problem(401, "AUTHENTICATION_REQUIRED")));
    openApp();
    expect(await within(await screen.findByRole("region", { name: "내 조" })).findByText("링크로 다시 들어와 주세요.")).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });
});

describe("participant group mock", () => {
  it("follows the server order and gives members only to a leader", async () => {
    const form = openForm();
    const ids = ["가", "나", "다"].map((name) => {
      const answers = form.fields.flatMap((field) => {
        if (field.systemKey === "NAME") return [{ fieldId: field.fieldId, text: name }];
        if (field.systemKey === "PHONE") return [{ fieldId: field.fieldId, text: "010-1234-5678" }];
        return [];
      });
      const issued = submitPublicApplication(EVENT, form.formId, { answers });
      if ("code" in issued) throw new Error(issued.code);
      return issued.participantId;
    });
    expect(readParticipantGroup(EVENT, ids[0])).toMatchObject({ status: "NOT_PUBLISHED", publishedAt: null, group: null });
    expect(readParticipantGroup(EVENT, "missing")).toMatchObject({ status: "NOT_ELIGIBLE" });

    publishMockGroupsFromApplicants(EVENT, 4, PUBLISHED);
    const leader = readParticipantGroup(EVENT, ids[0]);
    expect(leader).toMatchObject({ status: "ASSIGNED", publishedAt: PUBLISHED, leader: true, group: { name: "1조" } });
    expect(leader.members?.map((member) => member.name)).toEqual(["가", "나"]);
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({ leader: false, members: null, group: { leaders: [{ name: "가" }] } });
    expect(readParticipantGroup(EVENT, ids[2])).toMatchObject({ status: "UNASSIGNED", publishedAt: PUBLISHED, group: null });

    withdrawFromGroups(ids[0]);
    expect(readParticipantGroup(EVENT, ids[0])).toMatchObject({ status: "NOT_ELIGIBLE", publishedAt: null });
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({ group: { leaders: [] } });

    publishParticipantGroups(EVENT, { publishedAt: PUBLISHED, groups: [] });
    expect(readParticipantGroup(EVENT, ids[1])).toMatchObject({ status: "UNASSIGNED" });
  });
});
