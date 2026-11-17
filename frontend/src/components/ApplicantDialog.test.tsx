import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { setLifecycle } from "../mocks/operatorStore";
import { submitPublicApplication } from "../mocks/participantStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };

/** An open form with one applicant, 김하나, on an ACTIVE event. */
function applied() {
  const form = createForm(EVENT, OWNER, { customLabel: "식사" });
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  const texts: Record<string, string> = { 이름: "김하나", 전화: "010-1111-2222", 또래: "94", 식사: "채식" };
  const answers = form.fields
    .filter((field) => texts[field.label] !== undefined)
    .map((field) => ({ fieldId: field.fieldId, text: texts[field.label] }));
  const submitted = submitPublicApplication(EVENT, form.formId, { answers });
  if ("code" in submitted) throw new Error(submitted.code);
  return submitted;
}

async function openApp(path: string) {
  await login({ userId: OWNER });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

async function expectAnswers(dialog: HTMLElement) {
  const answers = await within(dialog).findAllByRole("definition", {}, WAIT);
  expect(answers.map((item) => item.textContent)).toContain("채식");
}

describe("applicant popup", () => {
  it("keeps the table's search when the popup closes (Escape goes back one entry)", async () => {
    applied();
    await openApp(`/events/${EVENT}/participants?sort=name:desc`);

    const searchbox = await screen.findByRole("searchbox", { name: "이름, 연락처, 소속 검색" }, WAIT);
    fireEvent.change(searchbox, { target: { value: "김하" } });
    fireEvent.click(await screen.findByRole("link", { name: "94 김하나" }));

    const dialog = await screen.findByRole("dialog", { name: "김하나" });
    await expectAnswers(dialog);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The text search lives only in memory: it survives because the table never left the screen.
    expect(screen.getByRole("searchbox", { name: "이름, 연락처, 소속 검색" })).toHaveValue("김하");
    expect(screen.getByRole("grid", { name: "신청자 명단" })).toBeInTheDocument();
  });

  it("closes in place on a shared link, where there is nothing to go back to", async () => {
    const { applicationId } = applied();
    await openApp(`/events/${EVENT}/participants?applicant=${applicationId}`);

    const dialog = await screen.findByRole("dialog", { name: "김하나" }, WAIT);
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("grid", { name: "신청자 명단" })).toBeInTheDocument();
  });

  it("opens from a name on 현장 운영", async () => {
    applied();
    await openApp(`/events/${EVENT}/field`);

    const list = await screen.findByRole("list", { name: "체크인 명단" }, WAIT);
    fireEvent.click(await within(list).findByRole("link", { name: "94 김하나" }, WAIT));

    const dialog = await screen.findByRole("dialog", { name: "김하나" });
    await expectAnswers(dialog);
    expect(screen.getByRole("list", { name: "체크인 명단" })).toBeInTheDocument();
  });

  it("opens from a name on 조 편성", async () => {
    applied();
    await openApp(`/events/${EVENT}/groups`);

    fireEvent.click(await screen.findByRole("link", { name: "94 김하나 신청 내용" }, WAIT));

    const dialog = await screen.findByRole("dialog", { name: "김하나" });
    await expectAnswers(dialog);
  });
});
