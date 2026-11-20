import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { groupPeople, moveAsOtherOperator, publish as publishGroups, readBoard, seedGroup } from "../mocks/groupStore";
import { setLifecycle } from "../mocks/operatorStore";
import { server } from "../mocks/server";
import {
  editAsOtherOperator,
  publishAsOtherOperator,
  readParticipantSchedule,
  readScheduleBoard,
  scheduleBoardVersion,
  seedScheduleItem,
  setSchedulePeriod,
} from "../mocks/scheduleStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

async function openAs(userIndex: number, path = `/events/${EVENT}/schedule`, status: "DRAFT" | "ACTIVE" | "ENDED" = "ACTIVE") {
  setLifecycle(EVENT, status, 2);
  await login({ userId: localUsers[userIndex].userId });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function period() {
  setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
}

function participantView(participantId = groupPeople(EVENT)[0].participantId) {
  return readParticipantSchedule(EVENT, participantId) as { status: string; items: { title: string; startTime: string; place: string | null; change: unknown }[]; removedItems: { title: string }[] };
}

function board() {
  return readScheduleBoard(EVENT, OWNER) as { publication: { hasUnpublishedChanges: boolean } };
}

async function editItem(rowName: RegExp) {
  fireEvent.click(await screen.findByRole("link", { name: rowName }, WAIT));
  return screen.findByRole("form", { name: "일정 고치기" }, WAIT);
}

describe("operator schedule (C4)", () => {
  it("says a schedule needs an event period", async () => {
    await openAs(0);
    expect(await screen.findByText(/행사 기간이 없어 일정을 만들 수 없어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공개" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "행사 설정으로 가기" })).toHaveAttribute("href", `/events/${EVENT}/settings`);
  });

  it("adds an item and publishes it with one button, and the participant sees it", async () => {
    period();
    await openAs(0);
    expect(await screen.findByText("아직 공개하지 않았어요", {}, WAIT)).toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole("link", { name: "+ 일정 추가" }, WAIT))[0]);
    const form = await screen.findByRole("form", { name: "일정 추가" }, WAIT);
    fireEvent.change(within(form).getByLabelText("시작"), { target: { value: "19:30" } });
    fireEvent.change(within(form).getByLabelText("끝 (선택)"), { target: { value: "21:30" } });
    fireEvent.change(within(form).getByLabelText("제목"), { target: { value: "저녁 집회" } });
    fireEvent.change(within(form).getByLabelText("장소 (선택)"), { target: { value: "대강당" } });
    fireEvent.change(within(form).getByLabelText("분류"), { target: { value: "WORSHIP" } });
    fireEvent.change(within(form).getByLabelText(/집회 칸 연결/), { target: { value: "opt_d1_worship" } });
    fireEvent.click(within(form).getByRole("button", { name: "저장하고 바로 공개" }));

    expect(await screen.findByText(/추가하고 공개했어요\. 추가 1 · 변경 0 · 삭제 0 · 알림 \d+명/, {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByText("모두 공개됐어요", {}, WAIT)).toBeInTheDocument();
    const row = screen.getByRole("link", { name: "19:30 저녁 집회 고치기" });
    expect(within(row).getByText("집회 칸")).toBeInTheDocument();
    expect(participantView().items).toMatchObject([{ title: "저녁 집회", startTime: "19:30", place: "대강당", change: null }]);
  });

  it("moves an item by 10 minutes, saves and publishes, and the participant sees 변경됨 with the old time", async () => {
    period();
    seedScheduleItem(EVENT, { day: 1, startTime: "18:00", endTime: "19:00", title: "저녁", place: "식당", category: "MEAL" });
    publishAsOtherOperator(EVENT);
    await openAs(1);
    const form = await editItem(/18:00 저녁 고치기/);
    fireEvent.click(within(form).getByRole("button", { name: "10분 미루기" }));
    expect(within(form).getByLabelText("시작")).toHaveValue("18:10");
    expect(within(form).getByLabelText("끝 (선택)")).toHaveValue("19:10");
    fireEvent.change(within(form).getByLabelText("장소 (선택)"), { target: { value: "본관 식당" } });
    fireEvent.click(within(form).getByRole("checkbox", { name: /참가자에게 알림 보내기/ }));
    fireEvent.click(within(form).getByRole("button", { name: "저장하고 바로 공개" }));

    expect(await screen.findByText("저장하고 공개했어요. 추가 0 · 변경 1 · 삭제 0 · 알림 보내지 않음", {}, WAIT)).toBeInTheDocument();
    const [item] = participantView().items;
    expect(item).toMatchObject({ startTime: "18:10", place: "본관 식당", change: { kind: "CHANGED", previous: { startTime: "18:00", endTime: "19:00", place: "식당" } } });
  });

  it("asks before publishing other unpublished changes, and saves nothing on cancel", async () => {
    period();
    seedScheduleItem(EVENT, { day: 1, startTime: "18:00", title: "저녁", category: "MEAL" });
    publishAsOtherOperator(EVENT);
    seedScheduleItem(EVENT, { day: 1, startTime: "20:00", title: "레크리에이션" });
    await openAs(0);
    expect(await screen.findByText(/공개하지 않은 변경 1건/, {}, WAIT)).toBeInTheDocument();
    let form = await editItem(/18:00 저녁 고치기/);
    fireEvent.change(within(form).getByLabelText("시작"), { target: { value: "18:30" } });
    fireEvent.click(within(form).getByRole("button", { name: "저장하고 바로 공개" }));
    let dialog = await screen.findByRole("dialog", { name: "다른 미공개 변경 1건도 함께 공개돼요" }, WAIT);
    expect(within(dialog).getByText("레크리에이션")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(participantView().items.map((entry) => entry.startTime)).toEqual(["18:00"]);

    form = screen.getByRole("form", { name: "일정 고치기" });
    fireEvent.click(within(form).getByRole("button", { name: "저장하고 바로 공개" }));
    dialog = await screen.findByRole("dialog", { name: "다른 미공개 변경 1건도 함께 공개돼요" }, WAIT);
    fireEvent.click(within(dialog).getByRole("button", { name: "함께 공개" }));
    expect(await screen.findByText(/저장하고 공개했어요\. 추가 1 · 변경 1/, {}, WAIT)).toBeInTheDocument();
    expect(participantView().items.map((entry) => `${entry.startTime} ${entry.title}`)).toEqual(["18:30 저녁", "20:00 레크리에이션"]);
  });

  it("shows the current value next to mine after another operator's edit and saves mine on request", async () => {
    period();
    const id = seedScheduleItem(EVENT, { day: 1, startTime: "18:00", title: "저녁", place: "식당", category: "MEAL" });
    await openAs(0);
    const form = await editItem(/18:00 저녁 고치기/);
    editAsOtherOperator(EVENT, id, { place: "야외" });
    fireEvent.change(within(form).getByLabelText("장소 (선택)"), { target: { value: "본관 식당" } });
    fireEvent.click(within(form).getByRole("button", { name: "저장만" }));
    const panel = await screen.findByRole("region", { name: "다른 운영자의 변경" }, WAIT);
    const row = within(panel).getByRole("row", { name: /장소/ });
    expect(within(row).getByText("야외")).toBeInTheDocument();
    expect(within(row).getByText("본관 식당")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "내 수정으로 저장" }));
    expect(await screen.findByText(/저장했어요\. 아직 참가자에게 보이지 않아요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "18:00 저녁 고치기" })).toHaveTextContent("본관 식당");
  });

  it("keeps a slot another item has out of reach", async () => {
    period();
    seedScheduleItem(EVENT, { day: 1, startTime: "18:00", title: "저녁", category: "MEAL", slotId: "opt_d1_dinner" });
    seedScheduleItem(EVENT, { day: 1, startTime: "18:30", title: "간식", category: "MEAL" });
    await openAs(0);
    const form = await editItem(/18:30 간식 고치기/);
    const option = within(within(form).getByLabelText(/식사 칸 연결/)).getByRole("option", { name: /저녁 · 다른 일정에 연결됨/ });
    expect(option).toBeDisabled();
  });

  it("deletes and publishes, and the participant sees it cancelled", async () => {
    period();
    seedScheduleItem(EVENT, { day: 1, startTime: "15:00", title: "산책" });
    publishAsOtherOperator(EVENT);
    await openAs(0);
    const form = await editItem(/15:00 산책 고치기/);
    fireEvent.click(within(form).getByRole("button", { name: "이 일정 지우기" }));
    const dialog = await screen.findByRole("dialog", { name: "이 일정을 지울까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "지우고 바로 공개" }));
    expect(await screen.findByText(/지우고 공개했어요\. 추가 0 · 변경 0 · 삭제 1/, {}, WAIT)).toBeInTheDocument();
    expect(participantView()).toMatchObject({ items: [], removedItems: [{ title: "산책" }] });
  });

  it("publishes the whole board after showing what goes out, with the notification switch", async () => {
    period();
    seedScheduleItem(EVENT, { day: 2, startTime: "09:30", title: "오전 집회", category: "WORSHIP" });
    await openAs(0, `/events/${EVENT}/schedule?day=2`);
    fireEvent.click(await screen.findByRole("button", { name: "공개" }, WAIT));
    const dialog = await screen.findByRole("dialog", { name: "일정표를 공개할까요?" });
    expect(within(dialog).getByText("09:30 오전 집회")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /참가자에게 알림 보내기/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "공개" }));
    expect(await screen.findByText(/공개했어요\. 추가 1/, {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(board().publication.hasUnpublishedChanges).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "공개" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "공개" }));
    expect(await screen.findByText("이미 공개된 내용과 같아요. 바뀐 것이 없어요.", {}, WAIT)).toBeInTheDocument();
  });

  it("asks again with the newest board when someone changed it before publishing", async () => {
    period();
    const id = seedScheduleItem(EVENT, { day: 1, startTime: "18:00", title: "저녁" });
    await openAs(0);
    fireEvent.click(await screen.findByRole("button", { name: "공개" }, WAIT));
    editAsOtherOperator(EVENT, id, { title: "저녁 식사" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "공개" }));
    expect(await within(dialog).findByText("그사이 일정표가 바뀌었어요. 최신 내용으로 다시 확인해 주세요.", {}, WAIT)).toBeInTheDocument();
    expect(await within(dialog).findByText("18:00 저녁 식사", {}, WAIT)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "공개" }));
    expect(await screen.findByText(/공개했어요/, {}, WAIT)).toBeInTheDocument();
  });

  it("reads the board again when the operator updates.schedule changes", async () => {
    period();
    const id = seedScheduleItem(EVENT, { day: 1, startTime: "18:00", title: "저녁" });
    server.use(
      http.get("/api/v1/operator/events/:eventId/updates", () =>
        HttpResponse.json({
          notifications: { latestSeq: 0, unreadCount: 0 },
          notices: 0,
          schedule: scheduleBoardVersion(EVENT),
          checkIns: 0,
          pollAfterSeconds: 1,
          serverTime: new Date().toISOString(),
        }),
      ),
    );
    await openAs(0);
    await screen.findByRole("link", { name: "18:00 저녁 고치기" }, WAIT);
    editAsOtherOperator(EVENT, id, { title: "저녁 식사" });
    expect(await screen.findByRole("link", { name: "18:00 저녁 식사 고치기" }, { timeout: 6000 })).toBeInTheDocument();
  }, 10000);

  it("lets STAFF read the working copy without writing", async () => {
    period();
    seedScheduleItem(EVENT, { day: 1, startTime: "18:00", title: "저녁" });
    await openAs(2);
    expect(await screen.findByText(/일정 쓰기 권한이 없어 일정표만 볼 수 있어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("저녁")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /고치기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공개" })).not.toBeInTheDocument();
  });

  it("is read-only on an ended event", async () => {
    period();
    seedScheduleItem(EVENT, { day: 1, startTime: "18:00", title: "저녁" });
    await openAs(0, `/events/${EVENT}/schedule`, "ENDED");
    expect(await screen.findByText(/종료된 행사라 일정을 바꿀 수 없어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공개" })).not.toBeInTheDocument();
  });

  it("shows leader-only items only to the published leader", async () => {
    period();
    const [leader, member] = groupPeople(EVENT);
    const group = seedGroup(EVENT, "1조");
    moveAsOtherOperator(EVENT, leader.participantId, group, true);
    moveAsOtherOperator(EVENT, member.participantId, group);
    const groups = readBoard(EVENT, OWNER) as { boardVersion: number };
    publishGroups(EVENT, OWNER, { expectedBoardVersion: groups.boardVersion, confirmUnassigned: true });
    seedScheduleItem(EVENT, { day: 1, startTime: "22:00", endTime: "00:30", title: "조장 모임", audience: "LEADERS" });
    seedScheduleItem(EVENT, { day: 1, startTime: "23:00", title: "운영 회의", audience: "STAFF" });
    publishAsOtherOperator(EVENT);
    expect(participantView(leader.participantId).items.map((item) => item.title)).toEqual(["조장 모임"]);
    expect(participantView(member.participantId).items).toEqual([]);

    await openAs(0);
    const row = await screen.findByRole("link", { name: "22:00 조장 모임 고치기" }, WAIT);
    expect(row).toHaveTextContent("22:00–00:30 (다음 날)");
    expect(row).toHaveTextContent("조장만");
  });
});

describe("ways into the schedule (C4)", () => {
  it("opens the schedule from the event menu and from the event home", async () => {
    period();
    await openAs(0, `/events/${EVENT}`);
    const links = await screen.findAllByRole("link", { name: /일정표/ }, WAIT);
    expect(links[0]).toHaveAttribute("href", `/events/${EVENT}/schedule`);
    fireEvent.click(screen.getByRole("button", { name: "일정 정리" }));
    expect(await screen.findByRole("heading", { name: "일정표" }, WAIT)).toBeInTheDocument();
    const menuLinks = screen.getAllByRole("link", { name: "일정" });
    expect(menuLinks.some((link) => link.getAttribute("href") === `/events/${EVENT}/schedule`)).toBe(true);
  });
});
