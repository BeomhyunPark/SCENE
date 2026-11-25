import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { moveAsOtherOperator, seedGroup, workingGroupOf } from "../mocks/groupStore";
import { operationOf, seedOperationMemo } from "../mocks/operationStore";
import { operatorRequests, setLifecycle } from "../mocks/operatorStore";
import { currentParticipant, openParticipantSession, submitPublicApplication } from "../mocks/participantStore";
import { revokePermissions } from "../mocks/taskStore";
import { chooseOption, findOptionLabel, selectValue } from "../test/select";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 3000 };

function seed(names: string[]) {
  const form = createForm(EVENT, OWNER, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  const nameField = form.fields.find((field) => field.label === "이름")!;
  const phoneField = form.fields.find((field) => field.label === "전화")!;
  return names.map((name, index) => {
    const submitted = submitPublicApplication(EVENT, form.formId, {
      answers: [
        { fieldId: nameField.fieldId, text: name },
        { fieldId: phoneField.fieldId, text: `010-1111-000${index}` },
      ],
      pin: "730914",
    });
    if ("code" in submitted) throw new Error(submitted.code);
    return submitted;
  });
}

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

async function openDrawer(name: string) {
  const edit = await screen.findByRole("button", { name: `${name} 운영 정보 수정` }, WAIT);
  fireEvent.click(edit);
  return screen.findByRole("dialog", { name: "현재 운영 정보 수정" });
}

describe("현재 운영 정보 수정 drawer (#337)", () => {
  it("resets the six-digit number and shows the temporary one once (DEC-078)", async () => {
    seed(["김하나"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    const drawer = await openDrawer("김하나");
    fireEvent.click(within(drawer).getByRole("button", { name: "6자리 초기화" }));
    expect(within(drawer).getByText(/임시 번호가 한 번 보여요/)).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole("button", { name: "초기화" }));
    const temporary = (await within(drawer).findByLabelText("임시 번호", {}, WAIT)).textContent ?? "";
    expect(temporary).toMatch(/^\d{6}$/);
    expect(operatorRequests.some((request) => request.method === "POST" && request.url.endsWith("/pin-reset"))).toBe(true);

    // The old number no longer works; the temporary one opens a session that must set a new number.
    expect(openParticipantSession(EVENT, { name: "김하나", phone: "010-1111-0000", pin: "730914" })).toMatchObject({
      code: "PARTICIPANT_LOGIN_FAILED",
    });
    expect(openParticipantSession(EVENT, { name: "김하나", phone: "010-1111-0000", pin: temporary })).toBeNull();
    expect(currentParticipant()?.pinChangeRequired).toBe(true);
  });

  it("saves the memo with its version, counts characters, and shows who saved it", async () => {
    const [first] = seed(["김하나"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    const drawer = await openDrawer("김하나");
    expect(within(drawer).getByText(/참가자가 제출한 원본 응답은 바뀌지 않아요/)).toBeInTheDocument();
    expect(within(drawer).getByText(/신청 당시 값/)).toBeInTheDocument();
    expect(within(drawer).getByText(/아직 여기서 바꿀 수 없어요/)).toBeInTheDocument();
    const save = within(drawer).getByRole("button", { name: "변경 저장" });
    expect(save).toBeDisabled();

    fireEvent.change(within(drawer).getByLabelText("운영 메모"), { target: { value: "토 저녁 외출" } });
    expect(within(drawer).getByText("7 / 2,000자")).toBeInTheDocument();
    fireEvent.click(save);

    // A memo alone has no confirmation: it does not change what participants see or any count.
    expect(await within(drawer).findByText("저장했어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "현재 운영 정보를 변경할까요?" })).not.toBeInTheDocument();
    expect(operationOf(first.applicationId)).toMatchObject({ memo: "토 저녁 외출", version: 1 });
    expect(within(drawer).getByText(/마지막 저장 .* · Local owner/)).toBeInTheDocument();
    expect(operatorRequests.some((request) => request.method === "PUT" && request.url.endsWith("/operation"))).toBe(true);
  });

  it("keeps my text on a version conflict and shows the latest memo", async () => {
    const [first] = seed(["김하나"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");

    seedOperationMemo(first.applicationId, "다른 운영자: 통근", localUsers[1].userId);
    fireEvent.change(within(drawer).getByLabelText("운영 메모"), { target: { value: "내 메모" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "변경 저장" }));

    expect(await within(drawer).findByText(/다른 운영자가 이 메모를 먼저 고쳤어요/, {}, WAIT)).toBeInTheDocument();
    expect(within(drawer).getByText("다른 운영자: 통근")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("운영 메모")).toHaveValue("내 메모");

    // The second save is on purpose over the latest version.
    fireEvent.click(within(drawer).getByRole("button", { name: "변경 저장" }));
    expect(await within(drawer).findByText("저장했어요.", {}, WAIT)).toBeInTheDocument();
    expect(operationOf(first.applicationId)).toMatchObject({ memo: "내 메모", version: 2 });
  });

  it("keeps the memo read-only without PARTICIPANT_WRITE when the group can still change", async () => {
    seed(["김하나"]);
    revokePermissions(EVENT, OWNER, ["PARTICIPANT_WRITE"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");
    expect(within(drawer).getByLabelText("운영 메모")).toHaveAttribute("readonly");
    expect(within(drawer).getByText(/운영 메모를 고칠 권한이 없어요/)).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "6자리 초기화" })).toBeDisabled();
    expect(within(drawer).getByText(/권한이 있는 운영자만 초기화할 수 있어요/)).toBeInTheDocument();
  });

  it("hides 수정 and says why when the operator can change nothing", async () => {
    seed(["김하나"]);
    await login({ userId: localUsers[2].userId });
    openApp(`/events/${EVENT}/participants`);
    await screen.findByRole("grid", { name: "신청자 명단" }, WAIT);
    expect(await screen.findByText(/고칠 권한이 없어 수정 버튼이 없어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /운영 정보 수정/ })).not.toBeInTheDocument();
  });

  it("does not save a memo in an archived event", async () => {
    seed(["김하나"]);
    setLifecycle(EVENT, "ARCHIVED", 2);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");
    expect(within(drawer).getByLabelText("운영 메모")).toHaveAttribute("readonly");
    expect(within(drawer).getAllByText(/보관된 행사는 운영 메모를 고칠 수 없어요/).length).toBeGreaterThan(0);
    expect(within(drawer).getByLabelText("조 배정")).toBeDisabled();
  });

  it("moves the group after a confirmation that lists only what changes", async () => {
    const [first] = seed(["김하나"]);
    const one = seedGroup(EVENT, "1조");
    const two = seedGroup(EVENT, "2조");
    moveAsOtherOperator(EVENT, first.participantId, one);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");

    const select = within(drawer).getByLabelText("조 배정");
    await findOptionLabel(select, "2조", WAIT);
    expect(selectValue(select)).toBe(one);
    expect(within(drawer).getByText(/공개해야 보여요/)).toBeInTheDocument();
    chooseOption(select, two);
    fireEvent.click(within(drawer).getByRole("button", { name: "변경 저장" }));

    const confirm = await screen.findByRole("dialog", { name: "현재 운영 정보를 변경할까요?" });
    expect(within(confirm).getByText(/조 배정: 1조 → 2조/)).toBeInTheDocument();
    expect(within(confirm).queryByText("운영 메모")).not.toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(workingGroupOf(EVENT, first.participantId)?.groupId).toBe(two), WAIT);
    expect(await within(drawer).findByText("저장했어요.", {}, WAIT)).toBeInTheDocument();
  });

  it("warns that a leader moved to another group loses the mark and goes to the end (#343)", async () => {
    const [first] = seed(["김하나"]);
    const one = seedGroup(EVENT, "1조");
    const two = seedGroup(EVENT, "2조");
    moveAsOtherOperator(EVENT, first.participantId, one, true);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");

    const select = within(drawer).getByLabelText("조 배정");
    await findOptionLabel(select, "1조 · 조장", WAIT);
    chooseOption(select, two);
    fireEvent.click(within(drawer).getByRole("button", { name: "변경 저장" }));

    const confirm = await screen.findByRole("dialog", { name: "현재 운영 정보를 변경할까요?" });
    expect(within(confirm).getByText(/조 배정: 1조 → 2조.*새 조의 맨 뒤에 들어가요/)).toBeInTheDocument();
    expect(within(confirm).getByText(/1조 조장 표시가 풀려요/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(workingGroupOf(EVENT, first.participantId)).toMatchObject({ groupId: two, leader: false }), WAIT);
  });

  it("says someone else moved the person first when the group changed meanwhile", async () => {
    const [first] = seed(["김하나"]);
    const one = seedGroup(EVENT, "1조");
    const two = seedGroup(EVENT, "2조");
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");
    const select = within(drawer).getByLabelText("조 배정");
    await findOptionLabel(select, "2조", WAIT);

    moveAsOtherOperator(EVENT, first.participantId, one);
    chooseOption(select, two);
    fireEvent.click(within(drawer).getByRole("button", { name: "변경 저장" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "현재 운영 정보를 변경할까요?" })).getByRole("button", { name: "저장" }));

    expect(await within(drawer).findByText(/다른 운영자가 이 사람의 조를 먼저 바꿨어요/, {}, WAIT)).toBeInTheDocument();
    expect(workingGroupOf(EVENT, first.participantId)?.groupId).toBe(one);
  });

  it("asks before closing with unsaved changes, and Esc closes when nothing changed", async () => {
    seed(["김하나"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    let drawer = await openDrawer("김하나");

    fireEvent.change(within(drawer).getByLabelText("운영 메모"), { target: { value: "메모" } });
    fireEvent.keyDown(document, { key: "Escape" });
    const ask = await screen.findByRole("dialog", { name: "저장하지 않은 변경이 있어요" });
    fireEvent.click(within(ask).getByRole("button", { name: "계속 고치기" }));
    expect(within(drawer).getByLabelText("운영 메모")).toHaveValue("메모");

    fireEvent.click(within(drawer).getByRole("button", { name: "취소" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "저장하지 않은 변경이 있어요" })).getByRole("button", { name: "저장하지 않고 닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "현재 운영 정보 수정" })).not.toBeInTheDocument());

    drawer = await openDrawer("김하나");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "현재 운영 정보 수정" })).not.toBeInTheDocument());
    expect(drawer).not.toBeInTheDocument();
  });

  it("shows the memo on the application detail and edits it with the same drawer", async () => {
    const [first] = seed(["김하나"]);
    seedOperationMemo(first.applicationId, "통근해요");
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants/${first.applicationId}`);

    expect(await screen.findByRole("heading", { name: "운영 메모" }, WAIT)).toBeInTheDocument();
    expect(screen.getByText("통근해요")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "수정" }, WAIT));
    const drawer = await screen.findByRole("dialog", { name: "현재 운영 정보 수정" });
    expect(within(drawer).getByLabelText("운영 메모")).toHaveValue("통근해요");
  });
});

describe("운영 메모 column (#337)", () => {
  it("turns on, filters 메모 있음, and is found by the search without going into the address", async () => {
    const [first] = seed(["김하나", "박둘"]);
    seedOperationMemo(first.applicationId, "토 저녁 외출");
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants?cols=${encodeURIComponent("operationMemo")}&f.operationMemo=has`);

    const table = await screen.findByRole("grid", { name: "신청자 명단" }, WAIT);
    expect(within(table).getByRole("columnheader", { name: /운영 메모/ })).toBeInTheDocument();
    const rows = within(table).getAllByRole("row").slice(1, -1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("토 저녁 외출");
    expect(screen.getByText(/운영 메모: 메모 있음/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "운영 메모 조건 지우기" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "이름, 연락처, 소속, 메모 검색" }), { target: { value: "외출" } });
    await waitFor(() => expect(within(table).getAllByRole("row").slice(1, -1)).toHaveLength(1));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("김하나");
  });
});

describe("신청 취소와 되돌리기 (DEC-084, #421)", () => {
  it("withdraws after a confirmation, leaves the table and sign-in, and restores from 취소 without the group", async () => {
    const [first] = seed(["김하나", "이둘"]);
    const one = seedGroup(EVENT, "1조");
    moveAsOtherOperator(EVENT, first.participantId, one, true);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");

    await waitFor(() => expect(within(drawer).getByRole("button", { name: "신청 취소" })).toBeEnabled(), WAIT);
    fireEvent.click(within(drawer).getByRole("button", { name: "신청 취소" }));
    const confirm = await screen.findByRole("dialog", { name: "김하나님의 신청을 취소할까요?" });
    expect(within(confirm).getByText(/조 배정\(1조\)이 지워져요/)).toBeInTheDocument();
    expect(within(confirm).getByText(/1조 조장 표시도 풀려요/)).toBeInTheDocument();
    fireEvent.change(within(confirm).getByLabelText("취소 사유 (선택)"), { target: { value: "가족 사정" } });
    fireEvent.click(within(confirm).getByRole("button", { name: "신청 취소하기" }));

    expect(await screen.findByText(/김하나님의 신청을 취소했어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "현재 운영 정보 수정" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "김하나 운영 정보 수정" })).not.toBeInTheDocument(), WAIT);
    expect(screen.getByRole("button", { name: "이둘 운영 정보 수정" })).toBeInTheDocument();
    expect(workingGroupOf(EVENT, first.participantId)).toBeNull();
    expect(openParticipantSession(EVENT, { name: "김하나", phone: "010-1111-0000", pin: "730914" })).toMatchObject({
      code: "PARTICIPANT_LOGIN_FAILED",
    });
    expect(operatorRequests.some((request) => request.method === "POST" && request.url.endsWith("/withdraw"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /취소 1/ }));
    const list = await screen.findByRole("region", { name: "취소된 신청 1명" });
    expect(within(list).getByText("사유: 가족 사정")).toBeInTheDocument();
    expect(within(list).getByText("이전 조: 1조")).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "되돌리기" }));
    const restore = await screen.findByRole("dialog", { name: "김하나님의 신청을 되돌릴까요?" });
    expect(within(restore).getByText(/조는 돌아오지 않아요/)).toBeInTheDocument();
    fireEvent.click(within(restore).getByRole("button", { name: "되돌리기" }));

    expect(await screen.findByRole("button", { name: "김하나 운영 정보 수정" }, WAIT)).toBeInTheDocument();
    expect(workingGroupOf(EVENT, first.participantId)).toBeNull();
    expect(openParticipantSession(EVENT, { name: "김하나", phone: "010-1111-0000", pin: "730914" })).toBeNull();
  });

  it("does not offer 신청 취소 in an ended event or without PARTICIPANT_WRITE", async () => {
    seed(["김하나"]);
    setLifecycle(EVENT, "ENDED", 2);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);
    const drawer = await openDrawer("김하나");
    expect(within(drawer).getByRole("button", { name: "신청 취소" })).toBeDisabled();
    expect(within(drawer).getByText(/끝나거나 보관된 행사는 참가 상태를 바꿀 수 없어요/)).toBeInTheDocument();
  });
});
