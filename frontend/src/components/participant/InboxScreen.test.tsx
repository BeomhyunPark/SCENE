import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { createForm, setAccepting } from "../../mocks/formStore";
import { assign, createGroup, publish, readBoard, setLeaders } from "../../mocks/groupStore";
import { createOperatorNotice } from "../../mocks/noticeStore";
import { setLifecycle } from "../../mocks/operatorStore";
import { notifyParticipants, participantNotificationSummary } from "../../mocks/participantNotificationStore";
import { publishParticipantRooms } from "../../mocks/participantRoomStore";
import { submitPublicApplication } from "../../mocks/participantStore";
import { server } from "../../mocks/server";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

/** Applies each name; the last one is the signed-in participant. */
function apply(names: string[]): string[] {
  const form = createForm(EVENT, OWNER, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  return names.map((name, index) => {
    const answers = form.fields.flatMap((field) => {
      if (field.systemKey === "NAME") return [{ fieldId: field.fieldId, text: name }];
      if (field.systemKey === "PHONE") return [{ fieldId: field.fieldId, text: `010-4444-55${String(index).padStart(2, "0")}` }];
      return [];
    });
    const issued = submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
    if ("code" in issued) throw new Error(issued.code);
    return issued.participantId;
  });
}

function publishGroup(name: string, leaderId: string | null, memberIds: string[]) {
  const created = createGroup(EVENT, OWNER, { name });
  if (!("group" in created)) throw new Error("group");
  const groupId = created.group.groupId;
  const everyone = leaderId ? [leaderId, ...memberIds] : memberIds;
  assign(EVENT, OWNER, { changes: everyone.map((participantId) => ({ participantId, fromGroupId: null, toGroupId: groupId })) });
  if (leaderId) setLeaders(EVENT, groupId, OWNER, { participantIds: [leaderId], expectedVersion: 0 });
  const board = readBoard(EVENT, OWNER);
  if (!("boardVersion" in board)) throw new Error("board");
  publish(EVENT, OWNER, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
}

function notice(title: string, audience = "ALL") {
  const result = createOperatorNotice(EVENT, OWNER, { title, body: `${title} 본문`, audience: [{ type: audience }], publish: true });
  if (!("notice" in result)) throw new Error("notice");
  return result.notice as { noticeId: string };
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

function bell() {
  return screen.getByRole("link", { name: /^알림함/ });
}

function currentTab() {
  return within(screen.getByRole("navigation", { name: "참가자 메뉴" }))
    .getAllByRole("link")
    .find((link) => link.getAttribute("aria-current") === "page")?.textContent;
}

describe("participant 알림함 (B5 #463)", () => {
  it("adds a row after the next updates check, counts it on the bell, and opens the notice", async () => {
    const [me] = apply(["김"]);
    openApp();
    await screen.findByRole("link", { name: "알림함" }, WAIT);
    // The bottom tabs are unchanged (groups are off here until a publication): the bell lives in the header.
    const tabs = within(screen.getByRole("navigation", { name: "참가자 메뉴" })).getAllByRole("link");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["홈", "일정", "공지", "내 정보"]);

    notice("집회 장소 변경");
    await poll();
    await waitFor(() => expect(bell()).toHaveAccessibleName("알림함, 읽지 않은 알림 1개"), WAIT);
    expect(within(bell()).getByText("1")).toBeInTheDocument();

    fireEvent.click(bell());
    const row = await screen.findByRole("button", { name: /새 공지.*집회 장소 변경/ }, WAIT);
    expect(within(row).getByLabelText("읽지 않음")).toBeInTheDocument();
    expect(currentTab()).toBe("홈");
    fireEvent.click(row);

    expect(await screen.findByRole("heading", { name: "집회 장소 변경", level: 1 }, WAIT)).toBeInTheDocument();
    expect(currentTab()).toBe("공지");
    await waitFor(() => expect(bell()).toHaveAccessibleName("알림함"), WAIT);
    expect(participantNotificationSummary(me).unreadCount).toBe(0);
  });

  it("opens the schedule tab, my group and the rooms screen from their rows", async () => {
    const [me] = apply(["김"]);
    publishGroup("1조", null, [me]);
    publishParticipantRooms(EVENT, [{ roomId: "r1", name: "301호", locationNote: "본관 3층", members: [] }]);
    // The room snapshot above has no members, so give this person their row directly.
    notifyParticipants(EVENT, [me], { kind: "ROOM_PUBLISHED", target: { type: "ROOM", id: "r1" }, title: "숙소가 정해졌어요", body: "301호 · 본관 3층" });
    notifyParticipants(EVENT, [me], { kind: "SCHEDULE_PUBLISHED", target: { type: "SCHEDULE", id: null }, title: "일정표가 올라왔어요", body: null });
    openApp(`/participate/${EVENT}/inbox`);

    await screen.findByRole("button", { name: /일정표가 올라왔어요/ }, WAIT);
    const rows = [...document.querySelectorAll<HTMLElement>(".participant-inbox__rows button")];
    expect(rows.map((row) => row.querySelector(".participant-inbox__title")?.textContent)).toEqual([
      "일정표가 올라왔어요",
      "숙소가 정해졌어요",
      "내 조가 정해졌어요",
    ]);
    await waitFor(() => expect(bell()).toHaveAccessibleName("알림함, 읽지 않은 알림 3개"), WAIT);

    fireEvent.click(rows[0]);
    expect(await screen.findByRole("heading", { name: "일정", level: 1 }, WAIT)).toBeInTheDocument();
    expect(currentTab()).toBe("일정");
    await waitFor(() => expect(bell()).toHaveAccessibleName("알림함, 읽지 않은 알림 2개"), WAIT);

    fireEvent.click(bell());
    fireEvent.click(await screen.findByRole("button", { name: /숙소가 정해졌어요/ }, WAIT));
    expect(await screen.findByRole("heading", { name: "숙소", level: 1 }, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(bell()).toHaveAccessibleName("알림함, 읽지 않은 알림 1개"), WAIT);

    fireEvent.click(bell());
    fireEvent.click(await screen.findByRole("button", { name: /내 조가 정해졌어요/ }, WAIT));
    await waitFor(() => expect(currentTab()).toBe("내 조"), WAIT);
    await waitFor(() => expect(bell()).toHaveAccessibleName("알림함"), WAIT);
  });

  it("shows an unknown kind as plain text and opens an operator edit on 내 정보", async () => {
    const [me] = apply(["김"]);
    notifyParticipants(EVENT, [me], { kind: "SOMETHING_NEW", target: { type: "WIDGET", id: "w1" }, title: "새로운 소식", body: "자세한 내용" });
    notifyParticipants(EVENT, [me], {
      kind: "APPLICATION_UPDATED_BY_OPERATOR",
      target: { type: "APPLICATION", id: me },
      title: "운영자가 신청 내역을 수정했어요",
      body: "참석 방식",
    });
    openApp(`/participate/${EVENT}/inbox`);

    expect(await screen.findByText("새로운 소식", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("자세한 내용")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새로운 소식/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /운영자가 신청 내역을 수정했어요/ }));
    await waitFor(() => expect(currentTab()).toBe("내 정보"), WAIT);
  });

  it("keeps leader-only notices out of a member's inbox", async () => {
    const [leader, me] = apply(["조장", "조원"]);
    publishGroup("1조", leader, [me]);
    notice("전체 안내");
    notice("조장 모임", "LEADERS");
    notice("운영진 집합", "STAFF");
    openApp(`/participate/${EVENT}/inbox`);

    expect(await screen.findByText("전체 안내", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("내 조가 정해졌어요")).toBeInTheDocument();
    expect(screen.queryByText("조장 모임")).not.toBeInTheDocument();
    expect(screen.queryByText("운영진 집합")).not.toBeInTheDocument();
    expect(participantNotificationSummary(leader).unreadCount).toBe(3);
  });

  it("marks everything read and says when there is nothing yet", async () => {
    const [me] = apply(["김"]);
    notice("첫째");
    notice("둘째");
    openApp(`/participate/${EVENT}/inbox`);
    await screen.findByText("둘째", {}, WAIT);
    fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
    await waitFor(() => expect(bell()).toHaveAccessibleName("알림함"), WAIT);
    expect(participantNotificationSummary(me).unreadCount).toBe(0);
    await waitFor(() => expect(screen.queryByLabelText("읽지 않음")).not.toBeInTheDocument(), WAIT);
    expect(screen.getByRole("button", { name: "모두 읽음" })).toBeDisabled();
  });

  it("reloads the open inbox only when updates says so, with no poll of its own", async () => {
    apply(["김"]);
    const reads = { list: 0 };
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname === "/api/v1/participant/notifications") reads.list += 1;
    });
    openApp(`/participate/${EVENT}/inbox`);
    await screen.findByText(/아직 받은 알림이 없어요/, {}, WAIT);
    await poll();
    await poll();
    expect(reads.list).toBe(1);

    notice("저녁 집회 시간 변경");
    await poll();
    expect(await screen.findByRole("button", { name: /저녁 집회 시간 변경/ }, WAIT)).toBeInTheDocument();
    expect(reads.list).toBe(2);
    server.events.removeAllListeners();
  });

  it("says there are no notifications yet", async () => {
    apply(["김"]);
    openApp(`/participate/${EVENT}/inbox`);
    expect(await screen.findByText(/아직 받은 알림이 없어요/, {}, WAIT)).toBeInTheDocument();
  });
});
