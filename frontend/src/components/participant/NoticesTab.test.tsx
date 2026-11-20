import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { createForm, setAccepting } from "../../mocks/formStore";
import { assign, createGroup, publish, readBoard, setLeaders } from "../../mocks/groupStore";
import {
  commandOperatorNotice,
  createOperatorNotice,
  participantNotificationSummary,
  patchOperatorNotice,
} from "../../mocks/noticeStore";
import { setLifecycle } from "../../mocks/operatorStore";
import { submitPublicApplication } from "../../mocks/participantStore";
import { server } from "../../mocks/server";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

/** Applies people in order; the last one applied is the signed-in participant (mock session). */
function apply(names: string[]): string[] {
  const form = createForm(EVENT, OWNER, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  return names.map((name, index) => {
    const answers = form.fields.flatMap((field) => {
      if (field.systemKey === "NAME") return [{ fieldId: field.fieldId, text: name }];
      if (field.systemKey === "PHONE") return [{ fieldId: field.fieldId, text: `010-2222-33${String(index).padStart(2, "0")}` }];
      return [];
    });
    const issued = submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
    if ("code" in issued) throw new Error(issued.code);
    return issued.participantId;
  });
}

function makeLeader(leaderId: string, memberIds: string[]) {
  const created = createGroup(EVENT, OWNER, { name: "1조" });
  if (!("group" in created)) throw new Error("group");
  const groupId = created.group.groupId;
  assign(EVENT, OWNER, {
    changes: [leaderId, ...memberIds].map((participantId) => ({ participantId, fromGroupId: null, toGroupId: groupId })),
  });
  setLeaders(EVENT, groupId, OWNER, { participantIds: [leaderId], expectedVersion: 0 });
  const board = readBoard(EVENT, OWNER);
  if (!("boardVersion" in board)) throw new Error("board");
  publish(EVENT, OWNER, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
}

function write(title: string, extra: Record<string, unknown> = {}) {
  const result = createOperatorNotice(EVENT, OWNER, {
    title,
    body: `${title} 본문`,
    audience: [{ type: "ALL" }],
    publish: true,
    ...extra,
  });
  if (!("notice" in result)) throw new Error("notice");
  return result.notice as { noticeId: string; version: number };
}

function openApp(path = `/participate/${EVENT}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** One `updates` check now, as the 25-second timer or coming back to the page would. */
async function poll() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function countNoticeReads() {
  const seen = { list: 0 };
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).pathname === "/api/v1/participant/notices") seen.list += 1;
  });
  return seen;
}

function latestCard() {
  return screen.getByRole("region", { name: "최신 공지" });
}

describe("participant notices (D4)", () => {
  it("shows a newly published notice on home after the next updates check, without polling notices", async () => {
    apply(["김"]);
    const reads = countNoticeReads();
    openApp();
    expect(await screen.findByText("공지가 올라오면 여기에 보여요.", {}, WAIT)).toBeInTheDocument();
    await poll();
    await poll();
    expect(reads.list).toBe(1);

    write("집회 장소 변경", { important: true });
    await poll();
    expect(await within(latestCard()).findByText("집회 장소 변경", {}, WAIT)).toBeInTheDocument();
    expect(within(latestCard()).getByText("새 공지")).toBeInTheDocument();
    expect(within(latestCard()).getByText("중요")).toBeInTheDocument();
    expect(reads.list).toBe(2);
    server.events.removeAllListeners();
  });

  it("puts pinned notices first, then the latest two, on the home card", async () => {
    apply(["김"]);
    write("첫째");
    write("고정 공지", { pinned: true });
    write("둘째");
    write("셋째");
    openApp();
    await within(await screen.findByRole("region", { name: "최신 공지" }, WAIT)).findByText("고정 공지", {}, WAIT);
    const titles = within(latestCard())
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.includes("/notices/"))
      .map((link) => link.querySelector(".notice-row__title")?.textContent);
    expect(titles).toEqual(["고정 공지", "셋째", "둘째"]);
  });

  it("opens a notice, marks it read, and drops 새 공지 from the list", async () => {
    const [me] = apply(["김"]);
    const notice = write("링크 안내", { body: "<b>굵게</b> 자료: https://example.com/x\njavascript:alert(1)" });
    const reads: unknown[] = [];
    server.use(
      http.post("/api/v1/participant/notifications/read", async ({ request }) => {
        reads.push(await request.clone().json());
        return undefined;
      }),
    );
    openApp(`/participate/${EVENT}/notices`);
    const row = await screen.findByRole("link", { name: /링크 안내/ }, WAIT);
    expect(within(row).getByText("새 공지")).toBeInTheDocument();
    expect(participantNotificationSummary(me).unreadCount).toBe(1);
    fireEvent.click(row);

    expect(await screen.findByRole("heading", { name: "링크 안내", level: 1 }, WAIT)).toBeInTheDocument();
    const body = document.querySelector(".notice-detail__body") as HTMLElement;
    expect(body.textContent).toContain("<b>굵게</b>");
    expect(body.querySelector("b")).toBeNull();
    const links = within(body).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com/x");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");

    await screen.findByRole("link", { name: "공지 목록으로" });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(reads).toEqual([{ target: { type: "NOTICE", id: notice.noticeId } }]);
    expect(participantNotificationSummary(me).unreadCount).toBe(0);
    fireEvent.click(screen.getByRole("link", { name: "공지 목록으로" }));
    const again = await screen.findByRole("link", { name: /링크 안내/ }, WAIT);
    expect(within(again).queryByText("새 공지")).not.toBeInTheDocument();
  });

  it("shows 수정됨 after an edit and removes an archived notice on the next check", async () => {
    apply(["김"]);
    const notice = write("처음 제목");
    openApp(`/participate/${EVENT}/notices`);
    await screen.findByText("처음 제목", {}, WAIT);
    expect(screen.queryByText(/수정됨/)).not.toBeInTheDocument();

    const edited = patchOperatorNotice(EVENT, notice.noticeId, OWNER, { expectedVersion: notice.version, title: "고친 제목" });
    await poll();
    expect(await screen.findByText("고친 제목", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/수정됨 \d{2}:\d{2}/)).toBeInTheDocument();

    const version = (edited as { notice: { version: number } }).notice.version;
    commandOperatorNotice(EVENT, notice.noticeId, OWNER, "archive", { expectedVersion: version });
    await poll();
    expect(await screen.findByText("아직 올라온 공지가 없어요. 공지가 올라오면 여기에 보여요.", {}, WAIT)).toBeInTheDocument();
  });

  it("says the notice cannot be shown when it is archived or out of reach", async () => {
    apply(["김"]);
    const staff = write("운영진만", { audience: [{ type: "STAFF" }] });
    openApp(`/participate/${EVENT}/notices/${staff.noticeId}`);
    expect(await screen.findByRole("heading", { name: "공지를 볼 수 없어요" }, WAIT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "공지 목록으로" }));
    expect(await screen.findByText("아직 올라온 공지가 없어요. 공지가 올라오면 여기에 보여요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText("운영진만")).not.toBeInTheDocument();
  });

  it("shows a leaders notice to the leader only, marked 조장 공지", async () => {
    const [member, leader] = apply(["조원", "조장"]);
    makeLeader(leader, [member]);
    write("조장 모임", { audience: [{ type: "LEADERS" }] });
    write("모두에게");
    openApp(`/participate/${EVENT}/notices`);
    const row = await screen.findByRole("link", { name: /조장 모임/ }, WAIT);
    expect(within(row).getByText("조장 공지")).toBeInTheDocument();
    expect(screen.getByText("모두에게")).toBeInTheDocument();
  });

  it("does not show a leaders notice to a member", async () => {
    const [leader, member] = apply(["조장", "조원"]);
    makeLeader(leader, [member]);
    const notice = write("조장 모임", { audience: [{ type: "LEADERS" }] });
    write("모두에게");
    const view = openApp(`/participate/${EVENT}/notices`);
    expect(await screen.findByText("모두에게", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText("조장 모임")).not.toBeInTheDocument();
    view.unmount();
    openApp(`/participate/${EVENT}/notices/${notice.noticeId}`);
    expect(await screen.findByRole("heading", { name: "공지를 볼 수 없어요" }, WAIT)).toBeInTheDocument();
  });
});
