import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { operatorRequests, setLifecycle } from "../mocks/operatorStore";
import { seedApplicationWithoutName, submitPublicApplication } from "../mocks/participantStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;

function openForm(customLabel?: string) {
  const form = createForm(EVENT, OWNER, customLabel ? { customLabel } : {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  return form;
}

function submit(form: ReturnType<typeof openForm>, texts: Record<string, string>) {
  const answers = form.fields
    .filter((field) => texts[field.label] !== undefined)
    .map((field) => ({ fieldId: field.fieldId, text: texts[field.label] }));
  const submitted = submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
  if ("code" in submitted) throw new Error(submitted.code);
  return submitted;
}

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("event participation applicants", () => {
  it("keeps the empty state when nobody has applied", async () => {
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    expect(await screen.findByRole("heading", { name: "아직 참가자가 없어요." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "참가자를 받는 방법" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "신청자" })).not.toBeInTheDocument();
    expect(operatorRequests.some((request) => request.url.startsWith(`/api/v1/operator/events/${EVENT}/applications`))).toBe(true);
  });

  it("shows applicants as the 참가 현황 table, with the phone for the owner and no access key", async () => {
    const form = openForm("식사");
    submit(form, { 이름: "김하나", 전화: "010-1111-2222", 또래: "94", 식사: "채식" });
    submit(form, { 이름: "박둘", 전화: "010-3333-4444" });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    const table = await screen.findByRole("grid", { name: "신청자 명단" });
    const rows = within(table).getAllByRole("row").slice(1, -1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("94 김하나");
    expect(rows[0]).toHaveTextContent("010-1111-2222");
    expect(rows[1]).toHaveTextContent("박둘");
    expect(screen.getByRole("heading", { level: 1, name: "참가 현황" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /전체 참가자 2/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "아직 참가자가 없어요." })).not.toBeInTheDocument();
    // #497: 참가자를 받는 방법 is for the empty state; the 참가 운영 badge and the always-open addresses are gone.
    expect(screen.queryByRole("heading", { name: "참가자를 받는 방법" })).not.toBeInTheDocument();
    expect(screen.queryByText("참가 운영")).not.toBeInTheDocument();
    expect(screen.queryByText("신청 주소")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "참가자 주소 QR" })).not.toBeInTheDocument();
    // 식사 is not one of the design's columns: it is off until the operator turns it on.
    expect(within(table).queryByText("채식")).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("730914");
  });

  it("leaves the phone column out for an operator without contact access", async () => {
    const form = openForm();
    submit(form, { 이름: "김하나", 전화: "010-1111-2222" });
    await login({ userId: localUsers[2].userId });
    openApp(`/events/${EVENT}/participants`);

    const table = await screen.findByRole("grid", { name: "신청자 명단" });
    expect(within(table).getByText("김하나")).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: /연락처/ })).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("010-1111-2222");
    expect(screen.getByRole("searchbox", { name: "이름, 연락처, 소속, 메모 검색" })).toHaveAttribute("placeholder", "이름, 소속, 메모 검색");
  });

  it("opens every answer for one applicant", async () => {
    const form = openForm("식사");
    const submitted = submit(form, { 이름: "김하나", 전화: "010-1111-2222", 식사: "채식" });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    fireEvent.click(await screen.findByRole("link", { name: "김하나" }));

    expect(await screen.findByRole("heading", { name: "신청 내용" })).toBeInTheDocument();
    const answers = await screen.findAllByRole("definition");
    expect(answers.map((item) => item.textContent)).toEqual(["김하나", "010-1111-2222", "채식"]);
    expect(screen.getAllByRole("term").map((item) => item.textContent)).toEqual(["이름", "전화", "식사"]);
    expect(document.body.textContent ?? "").not.toContain("730914");
    expect(
      operatorRequests.some(
        (request) => request.url === `/api/v1/operator/events/${EVENT}/applications/${submitted.applicationId}`,
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("link", { name: "신청자 목록" }));
    expect(await screen.findByRole("heading", { name: "신청자" })).toBeInTheDocument();
  });

  it("shows why the phone is missing on the detail for an operator without contact access", async () => {
    const form = openForm();
    const submitted = submit(form, { 이름: "김하나", 전화: "010-1111-2222" });
    await login({ userId: localUsers[2].userId });
    openApp(`/events/${EVENT}/participants/${submitted.applicationId}`);

    expect(await screen.findByRole("heading", { name: "신청 내용" })).toBeInTheDocument();
    const answers = await screen.findAllByRole("definition");
    expect(answers.map((item) => item.textContent)).toEqual(["김하나", "연락처 권한이 있는 운영자만 볼 수 있어요"]);
    expect(document.body.textContent ?? "").not.toContain("010-1111-2222");
  });

  it("shows a fallback when the name answer is missing", async () => {
    const form = openForm();
    const applicationId = seedApplicationWithoutName(EVENT, form.formId, "2026-10-08T03:00:00Z");
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    const row = await screen.findByRole("link", { name: "이름 없음" });
    fireEvent.click(row);

    expect(await screen.findByText("받은 답변이 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "이름 없음" })).toBeInTheDocument();
    await waitFor(() =>
      expect(operatorRequests.some((request) => request.url.endsWith(`/applications/${applicationId}`))).toBe(true),
    );
  });

  it("says the application is gone on a missing id", async () => {
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants/00000000-0000-4000-8000-0000000000ff`);

    expect(await screen.findByRole("alert")).toHaveTextContent("신청을 찾을 수 없어요.");
  });

  it("opens 행사 설정 from the header and keeps one card per way in (#483)", async () => {
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    expect(await screen.findByRole("heading", { name: "참가자를 받는 방법" })).toBeInTheDocument();
    // The dead QR card and the second road to 참가자 추가 are gone; 신청 링크 만들기 still opens 신청 설정.
    expect(screen.queryByRole("button", { name: "QR로 공유하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "참가자 직접 추가" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "신청 링크 만들기" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "행사 설정" }));
    expect(await screen.findByRole("heading", { level: 2, name: "행사 설정" })).toBeInTheDocument();
  });

  it("opens the addresses from 주소·QR, gives focus back on Esc, and keeps 신청서 설정 on the toolbar (#497)", async () => {
    const form = openForm();
    submit(form, { 이름: "김하나", 전화: "010-1111-2222" });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    await screen.findByRole("grid", { name: "신청자 명단" });
    const button = screen.getByRole("button", { name: "주소·QR" });
    button.focus();
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "주소·QR" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    expect(await within(dialog).findByTestId("apply-address")).toHaveTextContent(`/apply/${EVENT}/${form.formId}`);
    expect(within(dialog).getByTestId("participant-address")).toHaveTextContent(`/participate/${EVENT}`);
    expect(within(dialog).getByRole("img", { name: "참가자 주소 QR" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "QR 복사" })).toBeInTheDocument();
    // 신청서 설정 is on the toolbar, so the dialog does not repeat it.
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    // One way to 신청서 설정 in sight on the toolbar while people have applied.
    expect(screen.getAllByRole("link", { name: "신청서 설정" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("link", { name: "신청서 설정" }));
    // 신청 설정 is titled with the event name; its back arrow is named 참가 운영.
    expect(await screen.findByRole("link", { name: "참가 운영" })).toHaveAttribute("href", `/events/${EVENT}/participants`);
  });

  it("keeps the table's key guide behind 도움말 (#497)", async () => {
    const form = openForm();
    submit(form, { 이름: "김하나", 전화: "010-1111-2222" });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    await screen.findByRole("grid", { name: "신청자 명단" });
    const guide = screen.getByText(/칸을 누르고 화살표로 움직여요/);
    const details = guide.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(within(details).getByText("도움말"));
    expect(details).toHaveAttribute("open");
  });
});
