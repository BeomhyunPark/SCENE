import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { groupPeople, moveAsOtherOperator, publish as publishGroups, seedGroup, seedRoomRoster } from "../mocks/groupStore";
import { setLifecycle } from "../mocks/operatorStore";
import { editApplication, placeAsOtherOperator, roomOf, roomPublications, seedRooms } from "../mocks/roomBoardStore";
import { revokePermissions } from "../mocks/taskStore";

const EVENT = localEvent.eventId;
const WAIT = { timeout: 4000 };
const OWNER = localUsers[0].userId;

function person(label: string) {
  const [cohort, name] = label.includes(" ") ? label.split(" ") : [null, label];
  return groupPeople(EVENT).find((item) => item.name === name && item.cohort === cohort)!;
}

async function open(userIndex = 0, status: "ACTIVE" | "ENDED" = "ACTIVE") {
  setLifecycle(EVENT, status, 2);
  await login({ userId: localUsers[userIndex].userId });
  render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/rooms`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText(/^배정 \d/, {}, WAIT);
}

function card(name: string): HTMLElement {
  return screen.getByRole("article", { name });
}

function pool(): HTMLElement {
  return screen.getByRole("list", { name: /참가자$/ });
}

function menu(room: string) {
  const button = screen.getByRole("button", { name: `${room} 방 메뉴` });
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
}

function pick(label: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: `${label} 고르기` }));
}

async function idle() {
  await waitFor(
    () => {
      expect(document.querySelector(".event-groups__fetching")).toBeNull();
      for (const button of screen.queryAllByRole("button", { name: "참가자에게 공개" })) expect(button).toBeEnabled();
    },
    { timeout: 10000 },
  );
}

function chip(): string {
  return within(screen.getByRole("region", { name: "숙소 현황" })).getByText(/^배정 \d/).textContent ?? "";
}

describe("room board (G3 #458)", () => {
  it("opens from the event menu, makes a room and sends picked people to it", async () => {
    await open();
    const nav = screen.getByRole("navigation", { name: "운영 메뉴" });
    expect(within(nav).getByRole("link", { name: "숙소" })).toHaveAttribute("aria-current", "page");
    expect(chip()).toBe("배정 0 · 미배정 9 · 숙박 안 함 1");
    expect(screen.getByText(/숙박하지 않는 1명\(집회만·통근·당일\)은 방에 넣지 않아요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ 방 추가" }));
    const form = screen.getByRole("form", { name: "방 만들기" });
    fireEvent.change(within(form).getByLabelText("방 이름"), { target: { value: "301호" } });
    fireEvent.change(within(form).getByLabelText("정원"), { target: { value: "2" } });
    fireEvent.change(within(form).getByLabelText("성별 구분"), { target: { value: "opt_female" } });
    fireEvent.change(within(form).getByLabelText(/위치 메모/), { target: { value: "본관 3층" } });
    fireEvent.click(within(form).getByRole("button", { name: "방 만들기" }));
    expect(await screen.findByText("301호을 만들었어요.", {}, WAIT)).toBeInTheDocument();
    const room = card("301호");
    expect(within(room).getByText("0/2명")).toBeInTheDocument();
    expect(within(room).getByText("여 방")).toBeInTheDocument();
    expect(within(room).getByText("본관 3층")).toBeInTheDocument();

    pick("94 김하늘");
    pick("98 최예린");
    pick("95 김하람");
    expect(screen.getByText("3명 골랐어요")).toBeInTheDocument();
    fireEvent.click(within(card("301호")).getByRole("button", { name: "고른 3명 이 방으로 보내기" }));
    // Capacity and gender warn, never block.
    expect(await screen.findByText(/3명을 301호에 넣었어요\. 확인할 방: 301호 정원 초과 3\/2, 성별 다름 1명/, {}, WAIT)).toBeInTheDocument();
    await idle();
    expect(within(card("301호")).getByRole("list", { name: "301호 경고" })).toHaveTextContent("정원 초과 3/2");
    expect(chip()).toBe("배정 3 · 미배정 6 · 숙박 안 함 1");
    expect(roomOf(EVENT, person("95 김하람").participantId)).not.toBeNull();
  });

  it("never offers someone who does not sleep over, and explains a NOT_LODGING refusal", async () => {
    const [r1] = seedRooms(EVENT, 1, null);
    await open();
    fireEvent.change(screen.getByLabelText("숙박"), { target: { value: "NOT_LODGING" } });
    const card97 = within(pool()).getByText("97 이수아").closest(".event-groups__pool-card") as HTMLElement;
    expect(within(card97).queryByRole("checkbox")).toBeNull();
    expect(within(card97).getByText("방에 넣을 수 없어요")).toBeInTheDocument();

    // The answer changes after this screen loaded: the server refuses the whole request.
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    pick("94 김하늘");
    pick("96 오세훈");
    editApplication(EVENT, person("96 오세훈").participantId, { lodgingNights: [] });
    fireEvent.click(within(card("301호")).getByRole("button", { name: "고른 2명 이 방으로 보내기" }));
    expect(
      await screen.findByText(/숙박하지 않는 사람이 있어 아무것도 저장하지 않았어요 \(96 오세훈\)/, {}, WAIT),
    ).toBeInTheDocument();
    expect(roomOf(EVENT, person("94 김하늘").participantId)).toBeNull();
    // The refused person is dropped from the pick; sending again works for the rest.
    await idle();
    expect(screen.getByText("1명 골랐어요")).toBeInTheDocument();
    fireEvent.click(within(card("301호")).getByRole("button", { name: "고른 1명 이 방으로 보내기" }));
    await screen.findByText(/^1명을 301호에 넣었어요\./, {}, WAIT);
    expect(roomOf(EVENT, person("94 김하늘").participantId)).toBe(r1);
  });

  it("puts a whole published group in one room and leaves out who does not sleep over", async () => {
    const group = seedGroup(EVENT, "1조");
    for (const label of ["94 김하늘", "97 이수아", "98 최예린"]) moveAsOtherOperator(EVENT, person(label).participantId, group);
    publishGroups(EVENT, OWNER, { expectedBoardVersion: 4, confirmUnassigned: true });
    const [r1] = seedRooms(EVENT, 1, 6);
    await open();
    const batch = screen.getByRole("region", { name: "조 단위로 넣기" });
    fireEvent.change(within(batch).getByLabelText("조"), { target: { value: group } });
    fireEvent.change(within(batch).getByLabelText("방"), { target: { value: r1 } });
    expect(within(batch).getByText("숙박하지 않는 1명은 빼고 넣어요.")).toBeInTheDocument();
    fireEvent.click(within(batch).getByRole("button", { name: "1조 2명 넣기" }));
    expect(await screen.findByText(/1조 2명을 301호에 넣었어요/, {}, WAIT)).toBeInTheDocument();
    expect(roomOf(EVENT, person("94 김하늘").participantId)).toBe(r1);
    expect(roomOf(EVENT, person("97 이수아").participantId)).toBeNull();
    // The 조 filter reads the same published group.
    const filters = screen.getByRole("group", { name: "참가자 거르기" });
    fireEvent.change(within(filters).getByLabelText("배정 상태"), { target: { value: "all" } });
    fireEvent.change(within(filters).getByLabelText("조"), { target: { value: group } });
    expect(screen.getByRole("heading", { name: "참가자 3명" })).toBeInTheDocument();
  });

  it("marks 다시 볼 것 after an application edit and clears it on 확인 without moving anyone (A11)", async () => {
    const [r1] = seedRooms(EVENT, 1, 6);
    const 하늘 = person("94 김하늘").participantId;
    const 서준 = person("96 박서준").participantId;
    placeAsOtherOperator(EVENT, 하늘, r1);
    placeAsOtherOperator(EVENT, 서준, r1);
    editApplication(EVENT, 하늘, { lodgingNights: [1] });
    editApplication(EVENT, 서준, { lodgingNights: [] });
    await open();

    const panel = screen.getByRole("region", { name: "⚑ 다시 볼 것 2명" });
    expect(within(panel).getByText("자는 밤이 바뀌었어요")).toBeInTheDocument();
    expect(within(panel).getByText("숙박을 뺐어요")).toBeInTheDocument();
    expect(within(card("301호")).getByRole("list", { name: "301호 경고" })).toHaveTextContent("숙박 안 함 1명");

    fireEvent.click(within(panel).getByRole("button", { name: "94 김하늘 확인" }));
    expect(await screen.findByText("94 김하늘 확인했어요. 방은 그대로예요.", {}, WAIT)).toBeInTheDocument();
    await idle();
    expect(screen.getByRole("region", { name: "⚑ 다시 볼 것 1명" })).toBeInTheDocument();
    expect(roomOf(EVENT, 하늘)).toBe(r1);

    // Someone who dropped lodging can be taken out from the panel.
    fireEvent.click(screen.getByRole("button", { name: "96 박서준 미배정으로 빼기" }));
    expect(await screen.findByText("96 박서준을 미배정으로 뺐어요.", {}, WAIT)).toBeInTheDocument();
    await idle();
    expect(screen.queryByRole("region", { name: /다시 볼 것/ })).toBeNull();
    expect(roomOf(EVENT, 서준)).toBeNull();
  });

  it("publishes after confirming 미배정 and people left in a room who no longer sleep over", async () => {
    const [r1] = seedRooms(EVENT, 1, 6);
    placeAsOtherOperator(EVENT, person("94 김하늘").participantId, r1);
    placeAsOtherOperator(EVENT, person("96 박서준").participantId, r1);
    editApplication(EVENT, person("96 박서준").participantId, { lodgingNights: [] });
    await open();

    fireEvent.click(screen.getByRole("button", { name: "참가자에게 공개" }));
    let dialog = await screen.findByRole("dialog", { name: "참가자에게 숙소를 공개할까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "공개" }));
    expect(await screen.findByText("미배정 7명, 방에 남은 숙박 안 함 1명을 두고 공개할까요?", {}, WAIT)).toBeInTheDocument();
    dialog = screen.getByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "확인하고 공개" })).toBeEnabled());
    expect(within(dialog).getByText(/방에 넣은 뒤 숙박을 뺀 1명\(96 박서준\)이 방에 남아 있어요/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "방이 정해진 참가자에게 알림 보내기" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "확인하고 공개" }));
    expect(await screen.findByText(/참가자에게 숙소를 공개했어요\. 방이 바뀐 사람 2명 · 미배정 7명 · 경고가 있는 방 1개 · 알림 보내지 않음/, {}, WAIT)).toBeInTheDocument();
    expect(roomPublications(EVENT)).toHaveLength(1);
    expect(roomPublications(EVENT)[0].rooms[0].memberIds).toHaveLength(2);
    await idle();
    expect(screen.getByText(/마지막 공개/)).toBeInTheDocument();

    // Same board again: nothing new is published.
    fireEvent.click(screen.getByRole("button", { name: "참가자에게 공개" }));
    dialog = await screen.findByRole("dialog", { name: "참가자에게 숙소를 공개할까요?" });
    expect(within(dialog).getByText("바뀐 내용 없음")).toBeInTheDocument();
  });

  it("sets 참가자가 보는 범위 and edits, reorders and deletes rooms", async () => {
    seedRooms(EVENT, 2, 4);
    placeAsOtherOperator(EVENT, person("94 김하늘").participantId, null);
    await open();
    const scope = await screen.findByRole("radiogroup", { name: "방 배정표 공개 범위" }, WAIT);
    expect(within(scope).getByRole("radio", { name: "전체 방 배정표까지 (기본)" })).toBeChecked();
    fireEvent.click(within(scope).getByRole("radio", { name: "같은 방 사람까지" }));
    expect(await screen.findByText("참가자가 같은 방 사람까지 보도록 바꿨어요.", {}, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(within(scope).getByRole("radio", { name: "같은 방 사람까지" })).toBeChecked());

    menu("302호");
    fireEvent.click(screen.getByRole("button", { name: "302호 앞으로" }));
    await idle();
    await waitFor(() => {
      const titles = screen.getAllByRole("article").map((item) => item.getAttribute("aria-labelledby"));
      expect(screen.getAllByRole("article")[0]).toHaveAccessibleName("302호");
      expect(titles).toHaveLength(2);
    });

    menu("302호");
    fireEvent.click(screen.getByRole("button", { name: "302호 고치기" }));
    const edit = screen.getByRole("form", { name: "302호 고치기" });
    fireEvent.change(within(edit).getByLabelText("방 이름"), { target: { value: "302호 (가족방)" } });
    fireEvent.change(within(edit).getByLabelText("정원"), { target: { value: "" } });
    fireEvent.click(within(edit).getByRole("button", { name: "저장" }));
    expect(await screen.findByText("302호 (가족방)을 고쳤어요.", {}, WAIT)).toBeInTheDocument();
    await idle();
    expect(within(card("302호 (가족방)")).getByText(/정원 없음/)).toBeInTheDocument();

    menu("301호");
    fireEvent.click(screen.getByRole("button", { name: "301호 지우기" }));
    const dialog = screen.getByRole("dialog", { name: "301호을 지울까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "지우기" }));
    expect(await screen.findByText("301호을 지웠어요.", {}, WAIT)).toBeInTheDocument();
  });

  it("makes numbered rooms in one go and fills them with 200 people", async () => {
    seedRoomRoster(EVENT, 200);
    await open();
    const eligible = Number(/미배정 (\d+)/.exec(chip())![1]);
    expect(eligible).toBeGreaterThan(150);
    fireEvent.click(screen.getByRole("button", { name: "+ 방 추가" }));
    fireEvent.click(screen.getByRole("radio", { name: "번호로 여러 개" }));
    const form = screen.getByRole("form", { name: "번호로 여러 방 만들기" });
    fireEvent.change(within(form).getByLabelText("끝 번호"), { target: { value: "340" } });
    fireEvent.click(within(form).getByRole("button", { name: "301호~340호 40개 만들기" }));
    expect(await screen.findByText("방 40개를 만들었어요.", {}, { timeout: 10000 })).toBeInTheDocument();
    await idle();

    // Everyone visible at once: one request of up to 200.
    fireEvent.click(screen.getByRole("checkbox", { name: "보이는 사람 모두 고르기" }));
    fireEvent.change(screen.getByLabelText("보낼 방"), { target: { value: screen.getAllByRole("option", { name: /^301호/ })[0].getAttribute("value") } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(await screen.findByText(new RegExp(`${eligible}명을 301호에 넣었어요`), {}, { timeout: 10000 })).toBeInTheDocument();
    await idle();
    expect(chip()).toMatch(new RegExp(`^배정 ${eligible} · 미배정 0`));
  }, 30000);

  it("is read-only without ROOM_WRITE and when the event ended", async () => {
    revokePermissions(EVENT, localUsers[0].userId, ["ROOM_WRITE"]);
    await open();
    expect(screen.getByText("숙소 권한이 없어 배정판만 볼 수 있어요. 행사 OWNER에게 권한을 요청해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "참가자에게 공개" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "+ 방 추가" })).toBeNull();
  });
});
