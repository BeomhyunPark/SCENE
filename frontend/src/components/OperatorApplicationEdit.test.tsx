import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { operatorRequests, setLifecycle } from "../mocks/operatorStore";
import { applicationRevisions, openParticipantSession, submitPublicApplication, tableApplications } from "../mocks/participantStore";
import { revokePermissions } from "../mocks/taskStore";
import { operatorFields } from "./operatorAnswers";
import { revisedByLabel } from "./revisionDiff";

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
  const people = names.map((name, index) => {
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
  // Applications close: the operator path still works (DEC-088 §2).
  setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: false });
  return { form, people };
}

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("운영자 신청 고치기·직접 추가 (DEC-088, A12)", () => {
  it("edits the answers after applications close and keeps the operator on the revision", async () => {
    const { people } = seed(["김하나"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants/${people[0].applicationId}`);

    fireEvent.click(await screen.findByRole("link", { name: "신청 고치기" }, WAIT));
    const name = await screen.findByLabelText(/^이름/, {}, WAIT);
    // #497: one lead line. Edits are still open for the participant, so the DEC-088 line shows.
    expect(screen.getByText("참가자가 직접 고칠 수 있으면 참가자에게 맡겨 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("신청·수정을 닫은 뒤에도 고칠 수 있어요.")).not.toBeInTheDocument();
    fireEvent.change(name, { target: { value: "김두나" } });
    fireEvent.click(screen.getByRole("button", { name: "고친 내용 저장" }));

    expect(
      await screen.findByText("고친 내용을 저장했어요. 참가자에게 알림이 갔어요. 집계·조 편성·식수·숙소·CSV가 고친 값을 따라가요.", {}, WAIT),
    ).toBeInTheDocument();
    expect(operatorRequests.some((request) => request.method === "PUT" && request.url.endsWith("/answers"))).toBe(true);
    const current = tableApplications(EVENT)[0];
    expect(current.revision).toBe(2);
    expect(current.revisedBy).toBe("OPERATOR");
    expect(await screen.findByText("운영자 Local owner가 고침", {}, WAIT)).toBeInTheDocument();
    expect(applicationRevisions(EVENT, current.applicationId)?.[0]).toMatchObject({
      revisedBy: "OPERATOR",
      revisedByUserId: OWNER,
    });
  });

  it("says the operator can still edit once the participant's edits are closed (#497)", async () => {
    const { form, people } = seed(["김하나"]);
    setAccepting(EVENT, form.formId, OWNER, { acceptingEdits: false });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants/${people[0].applicationId}/edit`);

    await screen.findByLabelText(/^이름/, {}, WAIT);
    expect(screen.getByText("신청·수정을 닫은 뒤에도 고칠 수 있어요.")).toBeInTheDocument();
    expect(screen.queryByText("참가자가 직접 고칠 수 있으면 참가자에게 맡겨 주세요.")).not.toBeInTheDocument();
  });

  it("adds a participant with a temporary number shown once and refuses a phone already used", async () => {
    seed(["김하나"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    fireEvent.click(await screen.findByRole("link", { name: "참가자 추가" }, WAIT));
    fireEvent.change(await screen.findByLabelText(/^이름/, {}, WAIT), { target: { value: "현장손님" } });
    fireEvent.change(screen.getByLabelText(/^전화/), { target: { value: "010-2222-3333" } });
    fireEvent.click(screen.getByRole("button", { name: "참가자 추가" }));

    const pin = (await screen.findByLabelText("임시 번호", {}, WAIT)).textContent ?? "";
    expect(pin).toMatch(/^\d{6}$/);
    expect(screen.getByText("현장손님님을 추가했어요")).toBeInTheDocument();
    // #497: the add form's lead is one line; "전해 주세요" waits for the screen with the number.
    expect(screen.getByText("임시 번호예요. 이 화면을 벗어나면 다시 볼 수 없어요. 참가자에게 전해 주세요.")).toBeInTheDocument();
    const added = tableApplications(EVENT).find((row) => row.revisedBy === "OPERATOR")!;
    expect(added.revision).toBe(1);
    // The participant signs in with the temporary number and must choose a new one.
    expect(openParticipantSession(EVENT, { name: "현장손님", phone: "010-2222-3333", pin })).toBeNull();

    // One phone is one participant: the same phone points at the existing application.
    fireEvent.click(screen.getByRole("button", { name: "한 명 더 추가" }));
    fireEvent.change(await screen.findByLabelText(/^이름/, {}, WAIT), { target: { value: "다른사람" } });
    fireEvent.change(screen.getByLabelText(/^전화/), { target: { value: "010-1111-0000" } });
    fireEvent.click(screen.getByRole("button", { name: "참가자 추가" }));
    expect(await screen.findByText(/이 전화번호로 이미 신청한 사람이 있어요/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "그 신청 열기" })).toBeInTheDocument();
    expect(tableApplications(EVENT)).toHaveLength(2);
  });

  it("shows no edit button and no add link without PARTICIPANT_WRITE", async () => {
    const { people } = seed(["김하나"]);
    revokePermissions(EVENT, OWNER, ["PARTICIPANT_WRITE"]);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants/${people[0].applicationId}`);
    expect(await screen.findByRole("heading", { name: "신청 내용" }, WAIT)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: "신청 고치기" })).not.toBeInTheDocument());
  });

  it("leaves hidden and consent questions out and keeps only the name and phone required", () => {
    const base = { kind: "CUSTOM", label: "", position: 0, description: null, showWhen: null, presetKey: null, presetActive: null } as const;
    const fields = operatorFields([
      { ...base, fieldId: "n", systemKey: "NAME", answerType: "SHORT_TEXT", required: true, config: {}, hidden: false },
      { ...base, fieldId: "p", systemKey: "PHONE", answerType: "SHORT_TEXT", required: true, config: {}, hidden: false },
      { ...base, fieldId: "g", systemKey: null, answerType: "SINGLE_CHOICE", required: true, config: {}, hidden: false },
      { ...base, fieldId: "c", systemKey: null, answerType: "YES_NO", required: true, config: { style: "CONSENT" }, hidden: false },
      { ...base, fieldId: "h", systemKey: null, answerType: "SHORT_TEXT", required: false, config: {}, hidden: true },
    ]);
    expect(fields.map((field) => [field.fieldId, field.required])).toEqual([
      ["n", true],
      ["p", true],
      ["g", false],
    ]);
    expect(revisedByLabel("OPERATOR", 1, "김운영")).toBe("운영자 김운영가 추가");
    expect(revisedByLabel("OPERATOR", 3, null)).toBe("운영자가 고침");
    expect(revisedByLabel("PARTICIPANT", 2)).toBe("참가자가 고침");
    expect(revisedByLabel(null, 1)).toBe("처음 신청");
  });
});
