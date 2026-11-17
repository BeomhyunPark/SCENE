import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import {
  groupAssignmentLogs,
  groupPeople,
  clearBoardSlots,
  moveAsOtherOperator,
  readParticipantGroup,
  setChosenSlots,
  renameAsOtherOperator,
  seedGroup,
  seedLargeGroupBoard,
  withdrawGroupParticipant,
} from "../mocks/groupStore";
import { setLifecycle } from "../mocks/operatorStore";

const EVENT = localEvent.eventId;
const WAIT = { timeout: 4000 };

function person(label: string) {
  const [cohort, name] = label.includes(" ") ? label.split(" ") : [null, label];
  return groupPeople(EVENT).find((item) => item.name === name && item.cohort === cohort)!;
}

async function openAs(userIndex: number, status: "DRAFT" | "ACTIVE" | "ENDED" | "ARCHIVED" = "ACTIVE") {
  setLifecycle(EVENT, status, 2);
  await login({ userId: localUsers[userIndex].userId });
  render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/groups`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText(/^배정 \d/, {}, WAIT);
}

function card(name: string): HTMLElement {
  return screen.getByRole("article", { name });
}

async function findCard(name: string): Promise<HTMLElement> {
  return screen.findByRole("article", { name }, WAIT);
}

function pool(): HTMLElement {
  return screen.getByRole("list", { name: /참가자$/ });
}

function menu(group: string) {
  const button = screen.getByRole("button", { name: `${group} 조 메뉴` });
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
}

function pick(label: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: `${label} 고르기` }));
}

/** Writes disable the buttons until the board is read again; wait for that before the next click. */
async function idle() {
  await waitFor(() => {
    for (const button of screen.queryAllByRole("button", { name: "+ 조 추가" })) expect(button).toBeEnabled();
    expect(document.querySelector(".event-groups__fetching")).toBeNull();
  }, { timeout: 10000 });
}

function summary(): string {
  return within(screen.getByRole("region", { name: "편성 현황" })).getByText(/^배정 \d/).textContent ?? "";
}

describe("group board (#301)", () => {
  it("shows groups with counts and distributions, the unassigned list as 또래 이름, and the sidebar entry", async () => {
    const one = seedGroup(EVENT, "1조");
    moveAsOtherOperator(EVENT, person("94 김하늘").participantId, one);
    moveAsOtherOperator(EVENT, person("95 김하람").participantId, one, true);
    moveAsOtherOperator(EVENT, person("95 한지우").participantId, one);
    await openAs(0);

    expect(summary()).toContain("배정 3 · 미배정 7");
    const group = await findCard("1조");
    expect(within(group).getByText("3명")).toBeInTheDocument();
    expect(within(group).getByText("남 1 · 여 1 · 응답 없음 1")).toBeInTheDocument();
    expect(within(group).getByText("전체 참석 2")).toBeInTheDocument();
    expect(within(group).getByText("또래 94 1 · 95 2")).toBeInTheDocument();
    expect(within(group).getByText("부분 참석 1")).toBeInTheDocument();
    const members = within(within(group).getByRole("list", { name: "1조 조원" })).getAllByRole("listitem");
    expect(members[0]).toHaveTextContent("95 김하람");
    expect(members[0]).toHaveTextContent("조장");

    expect(screen.getByRole("heading", { name: "미배정 참가자 7명" })).toBeInTheDocument();
    expect(within(pool()).getByText("96 박서준")).toBeInTheDocument();
    expect(within(pool()).getByText("정민호")).toBeInTheDocument();
    expect(screen.getByText(/참가자에게 아직 공개하지 않은 변경이 있어요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "행사 홈" })).toHaveAttribute("href", `/events/${EVENT}`);
    expect(screen.getByRole("heading", { name: "전체 1조 중 1조" })).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "운영 메뉴" });
    expect(within(nav).getByRole("link", { name: "조 편성" })).toHaveAttribute("aria-current", "page");
  });

  it("filters by gender, 또래, attendance, 중그룹 and 셀, grouping missing answers as 응답 없음", async () => {
    await openAs(0);
    await screen.findByRole("heading", { name: "미배정 참가자 10명" }, WAIT);

    fireEvent.change(screen.getByLabelText("성별"), { target: { value: "__none__" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 1명" })).toBeInTheDocument();
    expect(within(pool()).getByText("95 한지우")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("성별"), { target: { value: "opt_female" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 5명" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("또래"), { target: { value: "94" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 2명" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    fireEvent.change(screen.getByLabelText("참석 방식"), { target: { value: "WORSHIP_ONLY" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 1명" })).toBeInTheDocument();
    expect(within(pool()).getByText("97 이수아")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    fireEvent.change(screen.getByLabelText("중그룹"), { target: { value: "__none__" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 1명" })).toBeInTheDocument();
    expect(within(pool()).getByText("정민호")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    // 새가족 (등반X) people have no cell (DEC-070 Follow-up 2026-11-17).
    fireEvent.change(screen.getByLabelText("셀"), { target: { value: "__none__" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 4명" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("셀"), { target: { value: "다윗셀" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 2명" })).toBeInTheDocument();

    expect(screen.getAllByRole("option", { name: "응답 없음 (4)" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    fireEvent.change(screen.getByLabelText("중그룹"), { target: { value: "새가족 (등반X)" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 2명" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    fireEvent.change(screen.getByLabelText("새가족"), { target: { value: "yes" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 2명" })).toBeInTheDocument();
    expect(within(pool()).getAllByText("새가족")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("새가족"), { target: { value: "__none__" } });
    expect(screen.getByRole("heading", { name: "미배정 참가자 1명" })).toBeInTheDocument();
    expect(within(pool()).getByText("정민호")).toBeInTheDocument();
  });

  it("creates, renames, reorders and deletes groups; deleting asks first and unassigns its members", async () => {
    await openAs(0);
    fireEvent.click(await screen.findByRole("button", { name: "+ 조 추가" }, WAIT));
    await findCard("1조");
    await idle();
    fireEvent.change(screen.getByLabelText("새 조 이름"), { target: { value: "  찬양조 " } });
    fireEvent.click(screen.getByRole("button", { name: "+ 조 추가" }));
    await findCard("찬양조");
    await idle();

    fireEvent.change(screen.getByLabelText("새 조 이름"), { target: { value: "1조" } });
    fireEvent.click(screen.getByRole("button", { name: "+ 조 추가" }));
    expect(await screen.findByText("같은 이름의 조가 있어요. 다른 이름을 써 주세요.", {}, WAIT)).toBeInTheDocument();
    await idle();

    menu("찬양조");
    fireEvent.click(screen.getByRole("button", { name: "찬양조 앞으로" }));
    await waitFor(() => {
      const titles = screen.getAllByRole("article").map((item) => item.querySelector("h3")?.textContent);
      expect(titles).toEqual(["찬양조", "1조"]);
    }, WAIT);
    await idle();

    menu("1조");
    fireEvent.click(screen.getByRole("button", { name: "1조 이름 바꾸기" }));
    fireEvent.change(screen.getByLabelText("1조 새 이름"), { target: { value: "새벽조" } });
    fireEvent.click(within(card("1조")).getByRole("button", { name: "저장" }));
    await findCard("새벽조");
    await idle();

    pick("94 김하늘");
    fireEvent.click(within(card("새벽조")).getByRole("button", { name: "고른 1명 이 조로 보내기" }));
    await waitFor(() => expect(within(card("새벽조")).getByText("94 김하늘")).toBeInTheDocument(), WAIT);
    await idle();

    menu("새벽조");
    fireEvent.click(screen.getByRole("button", { name: "새벽조 지우기" }));
    const dialog = screen.getByRole("dialog", { name: "새벽조를 지울까요?" });
    expect(within(dialog).getByText(/조원 1명은 미배정이 되고/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "지우기" }));
    expect(await screen.findByText("새벽조를 지웠어요. 1명이 미배정이 됐어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "새벽조" })).not.toBeInTheDocument();
    expect(within(pool()).getByText("94 김하늘")).toBeInTheDocument();
  });

  it("moves several people at once from the bar, and takes them back out to 미배정", async () => {
    seedGroup(EVENT, "1조");
    seedGroup(EVENT, "2조");
    await openAs(0);
    await findCard("2조");

    pick("94 김하늘");
    pick("96 박서준");
    // "이름을 눌러 배정": pressing the name on the 미배정 card picks the person.
    fireEvent.click(within(pool()).getByText("정민호"));
    const bar = screen.getByRole("region", { name: "고른 사람 옮기기" });
    expect(within(bar).getByText("3명 골랐어요")).toBeInTheDocument();
    fireEvent.change(within(bar).getByLabelText("보낼 조"), { target: { value: screen.getAllByRole("option", { name: "2조" })[0].getAttribute("value") } });
    fireEvent.click(within(bar).getByRole("button", { name: "보내기" }));

    expect(await screen.findByText("3명을 2조로 보냈어요.", {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(within(card("2조")).getByText(/^3명/)).toBeInTheDocument(), WAIT);
    expect(summary()).toContain("배정 3 · 미배정 7");
    expect(screen.queryByRole("region", { name: "고른 사람 옮기기" })).not.toBeInTheDocument();

    fireEvent.click(within(card("2조")).getByRole("checkbox", { name: "96 박서준 고르기" }));
    fireEvent.click(within(screen.getByRole("region", { name: "고른 사람 옮기기" })).getByRole("button", { name: "미배정으로 빼기" }));
    expect(await screen.findByText("1명을 미배정으로 뺐어요.", {}, WAIT)).toBeInTheDocument();
    expect(within(pool()).getByText("96 박서준")).toBeInTheDocument();
  });

  it("saves nothing on a conflict, reloads the board, lists what changed and can resend on the latest state", async () => {
    const one = seedGroup(EVENT, "1조");
    const two = seedGroup(EVENT, "2조");
    await openAs(0);
    await findCard("2조");

    pick("94 김하늘");
    pick("96 박서준");
    // Another operator puts 박서준 in 1조 after this screen loaded.
    moveAsOtherOperator(EVENT, person("96 박서준").participantId, one);
    fireEvent.click(within(card("2조")).getByRole("button", { name: "고른 2명 이 조로 보내기" }));

    const panel = await screen.findByRole("alert", {}, WAIT);
    expect(panel).toHaveTextContent("아무것도 저장하지 않았어요");
    expect(within(panel).getByRole("list", { name: "먼저 바뀐 사람" })).toHaveTextContent("96 박서준 — 내가 본 조 미배정 → 지금 1조");
    // Nothing saved: 김하늘 is still unassigned, and the reloaded board shows 박서준 in 1조.
    await waitFor(() => expect(within(card("1조")).getByText("96 박서준")).toBeInTheDocument(), WAIT);
    expect(within(card("2조")).queryByText("94 김하늘")).not.toBeInTheDocument();
    expect(groupAssignmentLogs(EVENT)).toHaveLength(0);

    fireEvent.click(within(panel).getByRole("button", { name: "최신 상태로 다시 보내기" }));
    expect(await screen.findByText("2명을 2조로 보냈어요.", {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(within(card("2조")).getByText(/^2명/)).toBeInTheDocument(), WAIT);
    expect(groupAssignmentLogs(EVENT).map((log) => log.to)).toEqual([two, two]);
  });

  it("marks up to three leaders among the group's members and clears the mark when a leader moves", async () => {
    const one = seedGroup(EVENT, "1조");
    seedGroup(EVENT, "2조");
    for (const label of ["94 김하늘", "95 김하람", "96 박서준", "94 이수아"]) {
      moveAsOtherOperator(EVENT, person(label).participantId, one);
    }
    await openAs(0);
    const group = await findCard("1조");

    for (const label of ["94 김하늘", "95 김하람", "96 박서준"]) {
      fireEvent.click(within(card("1조")).getByRole("button", { name: `${label} 조장으로 정하기` }));
      await waitFor(() => expect(within(card("1조")).getByRole("button", { name: `${label} 조장 해제` })).toBeEnabled(), WAIT);
      await idle();
    }
    expect(within(group).getByRole("button", { name: "94 이수아 조장으로 정하기" })).toBeDisabled();

    fireEvent.click(within(card("1조")).getByRole("button", { name: "95 김하람 조장 해제" }));
    await waitFor(() => expect(within(card("1조")).getByRole("button", { name: "94 이수아 조장으로 정하기" })).toBeEnabled(), WAIT);

    // A leader moved to 2조 is no longer a leader.
    fireEvent.click(within(card("1조")).getByRole("checkbox", { name: "94 김하늘 고르기" }));
    fireEvent.click(within(card("2조")).getByRole("button", { name: "고른 1명 이 조로 보내기" }));
    await waitFor(() => expect(within(card("2조")).getByText("94 김하늘")).toBeInTheDocument(), WAIT);
    expect(within(card("2조")).queryByText("조장", { selector: ".event-groups__leader" })).not.toBeInTheDocument();
    expect(within(card("2조")).getByRole("button", { name: "94 김하늘 조장으로 정하기" })).toBeInTheDocument();
  });

  it("refuses a leader change when the group changed in between", async () => {
    const one = seedGroup(EVENT, "1조");
    moveAsOtherOperator(EVENT, person("94 김하늘").participantId, one);
    await openAs(0);
    await findCard("1조");
    renameAsOtherOperator(EVENT, one, "1조");
    fireEvent.click(within(card("1조")).getByRole("button", { name: "94 김하늘 조장으로 정하기" }));
    expect(await screen.findByText(/다른 운영자가 이 조를 먼저 바꿔서 저장하지 않았어요/, {}, WAIT)).toBeInTheDocument();
  });

  it("refuses to move someone whose application was withdrawn and lists them under 철회됨", async () => {
    const one = seedGroup(EVENT, "1조");
    seedGroup(EVENT, "2조");
    moveAsOtherOperator(EVENT, person("98 최예린").participantId, one);
    await openAs(0);
    await findCard("2조");

    pick("94 김하늘");
    pick("98 최예린");
    withdrawGroupParticipant(EVENT, person("98 최예린").participantId);
    fireEvent.click(within(card("2조")).getByRole("button", { name: "고른 2명 이 조로 보내기" }));

    expect(await screen.findByText(/신청을 철회한 사람이 있어 아무것도 저장하지 않았어요\. \(98 최예린\)/, {}, WAIT)).toBeInTheDocument();
    expect(groupAssignmentLogs(EVENT)).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole("heading", { name: "철회됨 · 이전 조 1명" })).toBeInTheDocument(), WAIT);
    const withdrawn = screen.getByRole("list", { name: "철회됨" });
    expect(withdrawn).toHaveTextContent("최예린 · 이전 조 1조");
    expect(summary()).toContain("배정 0 · 미배정 9");
    expect(within(card("1조")).queryByText("98 최예린")).not.toBeInTheDocument();

    // 김하늘 stays chosen, so sending again works; the withdrawn person can still be taken out of 1조.
    fireEvent.click(within(card("2조")).getByRole("button", { name: "고른 1명 이 조로 보내기" }));
    expect(await screen.findByText("1명을 2조로 보냈어요.", {}, WAIT)).toBeInTheDocument();
    fireEvent.click(within(withdrawn).getByRole("button", { name: "최예린 미배정으로 빼기" }));
    expect(await screen.findByText("최예린을 이전 조에서 뺐어요.", {}, WAIT)).toBeInTheDocument();
  });

  it("is read only without GROUP_WRITE and closed to operators who cannot read the board", async () => {
    seedGroup(EVENT, "1조");
    // Local manager: event MANAGER (no GROUP_WRITE) and space ADMIN (may read the board).
    await openAs(1);
    expect(await screen.findByText(/조 편성 권한이 없어 편성판만 볼 수 있어요/, {}, WAIT)).toBeInTheDocument();
    expect(await findCard("1조")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ 조 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1조 조 메뉴" })).not.toBeInTheDocument();
  });

  it("tells STAFF without GROUP_WRITE or a space role that they cannot see the board", async () => {
    setLifecycle(EVENT, "ACTIVE", 2);
    await login({ userId: localUsers[2].userId });
    render(
      <MemoryRouter initialEntries={[`/events/${EVENT}/groups`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/조 편성을 볼 권한이 없어요/, {}, WAIT)).toBeInTheDocument();
  });

  it("blocks editing an ended or archived event and says why", async () => {
    seedGroup(EVENT, "1조");
    await openAs(0, "ENDED");
    expect(await screen.findByText("종료된 행사라 조 편성을 바꿀 수 없어요. 편성판은 볼 수 있어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ 조 추가" })).not.toBeInTheDocument();
  });

  it("reports the server's EVENT_ENDED when the event ended after the board loaded", async () => {
    seedGroup(EVENT, "1조");
    await openAs(0);
    await findCard("1조");
    pick("94 김하늘");
    setLifecycle(EVENT, "ENDED", 3);
    fireEvent.click(within(card("1조")).getByRole("button", { name: "고른 1명 이 조로 보내기" }));
    expect(await screen.findByText("종료된 행사라 저장하지 않았어요.", {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByText(/종료된 행사라 조 편성을 바꿀 수 없어요/, {}, WAIT)).toBeInTheDocument();
  });

  it("handles a retreat-sized board: 150 people in 15 groups, choosing everyone visible at once", async () => {
    seedLargeGroupBoard(EVENT, 150, 15);
    await openAs(0);
    await findCard("4조");
    expect(screen.getByRole("heading", { name: "전체 15조 중 1–4조 · 나머지 11조에 0명 배정" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "5조" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전 조" })).toBeDisabled();
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole("button", { name: "다음 조" }));
    expect(await findCard("15조")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "전체 15조 중 13–15조 · 나머지 12조에 0명 배정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 조" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("region", { name: /^전체 15조/ }), { key: "ArrowLeft" });
    expect(await findCard("9조")).toBeInTheDocument();
    for (let index = 0; index < 2; index += 1) fireEvent.click(screen.getByRole("button", { name: "이전 조" }));
    expect(summary()).toContain("배정 0 · 미배정 150");

    fireEvent.change(screen.getByLabelText("또래"), { target: { value: "94" } });
    const heading = screen.getByRole("heading", { name: /^미배정 참가자 \d+명$/ });
    const count = Number(heading.textContent!.match(/(\d+)명/)![1]);
    expect(count).toBeGreaterThan(5);
    fireEvent.click(screen.getByRole("checkbox", { name: "보이는 사람 모두 고르기" }));
    fireEvent.click(within(card("3조")).getByRole("button", { name: `고른 ${count}명 이 조로 보내기` }));
    expect(await screen.findByText(`${count}명을 3조로 보냈어요.`, {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(summary()).toContain(`배정 ${count}`), WAIT);
  });
});

describe("group publish (#302)", () => {
  function publishButton() {
    return screen.getByRole("button", { name: "참가자에게 공개" });
  }

  function dialog() {
    return screen.getByRole("dialog");
  }

  it("publishes after confirming the unassigned, then the participant sees the group; a resend is ALREADY_PUBLISHED", async () => {
    const one = seedGroup(EVENT, "1조");
    const leader = person("94 김하늘").participantId;
    moveAsOtherOperator(EVENT, leader, one, true);
    moveAsOtherOperator(EVENT, person("95 김하람").participantId, one);
    await openAs(0);
    expect(screen.getByText("아직 공개하지 않았어요.")).toBeInTheDocument();
    expect(readParticipantGroup(EVENT, leader)).toMatchObject({ status: "NOT_PUBLISHED" });

    fireEvent.click(publishButton());
    expect(within(dialog()).getByText("참가자에게 조 편성을 공개할까요?")).toBeInTheDocument();
    expect(within(dialog()).getByText("처음 공개")).toBeInTheDocument();
    const items = within(within(dialog()).getByRole("list", { name: "공개되는 내용" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["조가 바뀌는 사람 2명", "바뀐 조 1개", "미배정 8명"]);
    expect(within(dialog()).getByText(/조 이름과 조장 이름을 봐요. 조장은 자기 조원의 이름과 또래를 더 봐요/)).toBeInTheDocument();

    fireEvent.click(within(dialog()).getByRole("button", { name: "공개" }));
    expect(await screen.findByText("미배정 8명을 두고 공개할까요?", {}, WAIT)).toBeInTheDocument();
    expect(readParticipantGroup(EVENT, leader)).toMatchObject({ status: "NOT_PUBLISHED" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "미배정 두고 공개" }));

    expect(await screen.findByText("참가자에게 공개했어요. 조가 바뀐 사람 2명 · 미배정 8명", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/^마지막 공개 .+ · Local owner\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/참가자에게 아직 공개하지 않은 변경이 있어요/)).not.toBeInTheDocument();
    const seen = readParticipantGroup(EVENT, leader);
    expect(seen).toMatchObject({ status: "ASSIGNED", leader: true, group: { name: "1조", leaders: [{ name: "김하늘" }] } });
    expect(seen.members?.map((member) => member.name)).toEqual(["김하늘", "김하람"]);
    expect(readParticipantGroup(EVENT, person("96 박서준").participantId)).toMatchObject({ status: "UNASSIGNED" });

    await idle();
    fireEvent.click(publishButton());
    expect(within(dialog()).getByText("바뀐 내용 없음")).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole("button", { name: "공개" }));
    expect(await screen.findByText("참가자에게 보이는 조 편성과 같아서 새로 공개하지 않았어요.", {}, WAIT)).toHaveAttribute("role", "status");
  });

  it("publishes at once when everyone is assigned", async () => {
    const one = seedGroup(EVENT, "1조");
    for (const item of groupPeople(EVENT)) moveAsOtherOperator(EVENT, item.participantId, one);
    await openAs(0);
    fireEvent.click(publishButton());
    fireEvent.click(within(dialog()).getByRole("button", { name: "공개" }));
    expect(await screen.findByText("참가자에게 공개했어요. 조가 바뀐 사람 10명", {}, WAIT)).toBeInTheDocument();
    expect(readParticipantGroup(EVENT, person("정민호").participantId)).toMatchObject({ status: "ASSIGNED", group: { name: "1조" } });
  });

  it("on a version conflict reads the board again and asks again with the latest numbers", async () => {
    const one = seedGroup(EVENT, "1조");
    for (const item of groupPeople(EVENT)) moveAsOtherOperator(EVENT, item.participantId, one);
    await openAs(0);
    fireEvent.click(publishButton());
    moveAsOtherOperator(EVENT, person("정민호").participantId, null);
    fireEvent.click(within(dialog()).getByRole("button", { name: "공개" }));
    expect(await within(dialog()).findByText(/그사이 편성판이 바뀌어 공개하지 않았어요/, {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog()).getByText("미배정 1명")).toBeInTheDocument(), WAIT);
    expect(readParticipantGroup(EVENT, person("정민호").participantId)).toMatchObject({ status: "NOT_PUBLISHED" });

    fireEvent.click(within(dialog()).getByRole("button", { name: "공개" }));
    fireEvent.click(await within(dialog()).findByRole("button", { name: "미배정 두고 공개" }, WAIT));
    expect(await screen.findByText("참가자에게 공개했어요. 조가 바뀐 사람 9명 · 미배정 1명", {}, WAIT)).toBeInTheDocument();
    expect(readParticipantGroup(EVENT, person("정민호").participantId)).toMatchObject({ status: "UNASSIGNED" });
  });

  it("keeps the button closed without GROUP_WRITE and says why", async () => {
    await openAs(1);
    await screen.findByText(/조 편성 권한이 없어 편성판만 볼 수 있어요/, {}, WAIT);
    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAccessibleDescription(/조 편성 권한이 없어/);
  });

  it("closes publishing for an ended event and reports EVENT_ENDED if it ended while the dialog was open", async () => {
    seedGroup(EVENT, "1조");
    await openAs(0);
    fireEvent.click(publishButton());
    setLifecycle(EVENT, "ENDED", 3);
    fireEvent.click(within(dialog()).getByRole("button", { name: "공개" }));
    expect(await screen.findByText("종료된 행사라 저장하지 않았어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(publishButton()).toBeDisabled(), WAIT);
    expect(publishButton()).toHaveAccessibleDescription("종료된 행사라 조 편성을 바꿀 수 없어요. 편성판은 볼 수 있어요.");
  });
});

describe("attendance bars (#318)", () => {
  it("draws each member's attended runs, says 모름 for no answer, and counts people per slot", async () => {
    const one = seedGroup(EVENT, "1조");
    moveAsOtherOperator(EVENT, person("94 김하늘").participantId, one);
    moveAsOtherOperator(EVENT, person("96 박서준").participantId, one);
    moveAsOtherOperator(EVENT, person("97 이수아").participantId, one);
    moveAsOtherOperator(EVENT, person("95 한지우").participantId, one);
    setChosenSlots(EVENT, person("97 이수아").participantId, []);
    await openAs(0);
    const group = await findCard("1조");

    expect(screen.getByText("칸: 아침·점심·저녁·집회")).toBeInTheDocument();
    expect(within(group).getByRole("img", { name: "모든 칸 참석" })).toBeInTheDocument();
    expect(within(group).getByRole("img", { name: "참석 1월 23일 (토) 저녁–1월 24일 (일) 점심, 1월 24일 (일) 집회" })).toBeInTheDocument();
    expect(within(group).getByRole("img", { name: "참석 칸 없음" })).toBeInTheDocument();
    expect(within(group).getByText("참석 칸 모름")).toBeInTheDocument();

    expect(within(group).getByText(/시간대별 인원/)).toHaveTextContent("시간대별 인원 · 모름 1");
    const cells = within(within(group).getByRole("list", { name: "시간대별 인원" })).getAllByRole("listitem");
    expect(cells.map((cell) => cell.querySelector("[aria-hidden]")?.textContent)).toEqual(["1", "1", "1", "1", "2", "2", "2", "2", "1", "2"]);
    expect(cells[4]).toHaveTextContent("1월 23일 (토) 저녁 2명");

    // 미배정 cards carry the same bar; everyone else here attends all slots.
    expect(within(pool()).getAllByRole("img", { name: "모든 칸 참석" }).length).toBeGreaterThan(0);
  });

  it("shows only the attendance tag when the board has no slots", async () => {
    const one = seedGroup(EVENT, "1조");
    moveAsOtherOperator(EVENT, person("96 박서준").participantId, one);
    clearBoardSlots(EVENT);
    await openAs(0);
    const group = await findCard("1조");
    expect(within(group).getByText("부분 참석")).toBeInTheDocument();
    expect(within(group).queryByRole("img")).not.toBeInTheDocument();
    expect(within(group).queryByText(/시간대별 인원/)).not.toBeInTheDocument();
    expect(screen.queryByText("칸: 아침·점심·저녁·집회")).not.toBeInTheDocument();
  });
});
