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

  it("lists applicant names and submit times without phone or access key", async () => {
    const form = openForm("식사");
    const first = submit(form, { 이름: "김하나", 전화: "010-1111-2222", 식사: "채식" });
    submit(form, { 이름: "박둘", 전화: "010-3333-4444" });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    const section = await screen.findByRole("region", { name: "신청자" });
    const rows = within(section).getAllByRole("link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("김하나");
    expect(rows[0]).toHaveTextContent(/\d{4}\. \d{1,2}\. \d{1,2}\. \d{2}:\d{2}/);
    expect(rows[1]).toHaveTextContent("박둘");
    expect(screen.getByText("2명")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "아직 참가자가 없어요." })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "참가자를 받는 방법" })).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("010-1111-2222");
    expect(body).not.toContain("채식");
    expect(body).not.toContain(first.accessKey);
  });

  it("opens every answer for one applicant", async () => {
    const form = openForm("식사");
    const submitted = submit(form, { 이름: "김하나", 전화: "010-1111-2222", 식사: "채식" });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    fireEvent.click(await screen.findByRole("link", { name: /김하나/ }));

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

  it("shows a fallback when the name answer is missing", async () => {
    const form = openForm();
    const applicationId = seedApplicationWithoutName(EVENT, form.formId, "2026-10-08T03:00:00Z");
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/participants`);

    const row = await screen.findByRole("link", { name: /이름 없음/ });
    expect(row).toHaveTextContent("2026. 10. 8. 12:00");
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
