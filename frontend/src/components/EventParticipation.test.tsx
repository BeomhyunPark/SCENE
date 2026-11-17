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
  const submitted = submitPublicApplication(EVENT, form.formId, { answers });
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
    const first = submit(form, { 이름: "김하나", 전화: "010-1111-2222", 또래: "94", 식사: "채식" });
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
    expect(screen.getByRole("heading", { name: "참가자를 받는 방법" })).toBeInTheDocument();
    // 식사 is not one of the design's columns: it is off until the operator turns it on.
    expect(within(table).queryByText("채식")).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(first.accessKey);
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
    expect(screen.getByRole("searchbox", { name: "이름, 연락처, 소속 검색" })).toHaveAttribute("placeholder", "이름, 소속 검색");
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
    expect(document.body.textContent ?? "").not.toContain(submitted.accessKey);
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
});
