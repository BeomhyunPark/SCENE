import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { createForm, setAccepting } from "../../mocks/formStore";
import { setLifecycle } from "../../mocks/operatorStore";
import { readOwnApplication, reviseAsSomeoneElse, submitPublicApplication } from "../../mocks/participantStore";
import { server } from "../../mocks/server";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;

/** One applicant on the mock server, signed in by the submit like the real one (DEC-078). */
function applied() {
  const form = createForm(EVENT, OWNER, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  const ids = Object.fromEntries(form.fields.map((field) => [field.systemKey, field.fieldId]));
  const issued = submitPublicApplication(EVENT, form.formId, {
    answers: [
      { fieldId: ids.NAME, text: "김민수" },
      { fieldId: ids.PHONE, text: "010-2222-3333" },
      { fieldId: ids.COHORT, text: "94" },
    ],
    pin: "730914",
  });
  if ("code" in issued) throw new Error(issued.code);
  return { formId: form.formId, ids, participantId: issued.participantId };
}

function openApp(path = `/participate/${EVENT}/me`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function applicationCard() {
  return screen.getByRole("region", { name: "내 신청" });
}

describe("내 정보 (#427)", () => {
  it("shows the answers and saves an edit as a new revision", async () => {
    const { ids } = applied();
    const sent: unknown[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "PUT" && request.url.endsWith("/participant/application")) {
        void request.clone().json().then((body) => sent.push(body));
      }
    });
    openApp();
    const card = await screen.findByRole("region", { name: "내 신청" });
    expect(await within(card).findByText("김민수")).toBeInTheDocument();
    expect(within(card).getByText("010-2222-3333")).toBeInTheDocument();
    expect(within(card).getByText("94")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("link", { name: "고치기" }));
    expect(await screen.findByRole("heading", { name: "신청 고치기" })).toBeInTheDocument();
    const phone = screen.getByLabelText("전화");
    expect(phone).toHaveAttribute("readonly");
    expect(screen.getByText(/전화번호는 고칠 수 없어요/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^또래/), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByText("출생연도 뒤 두 자리를 적어 주세요. 예: 94")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^또래/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByText("신청을 고쳤어요.")).toBeInTheDocument();
    expect(await within(applicationCard()).findByText("95")).toBeInTheDocument();
    expect(readOwnApplication()?.revision).toBe(2);
    expect(sent).toEqual([
      {
        expectedRevision: 1,
        answers: [
          { fieldId: ids.NAME, text: "김민수" },
          { fieldId: ids.PHONE, text: "010-2222-3333" },
          { fieldId: ids.COHORT, text: "95" },
        ],
      },
    ]);
    server.events.removeAllListeners();
  });

  it("only reads when edits are closed, even after applications closed", async () => {
    const { formId } = applied();
    setAccepting(EVENT, formId, OWNER, { acceptingApplications: false, acceptingEdits: false });
    openApp();
    await within(await screen.findByRole("region", { name: "내 신청" })).findByText("김민수");
    expect(within(applicationCard()).queryByRole("link", { name: "고치기" })).not.toBeInTheDocument();
    expect(screen.getByText(/지금은 신청을 고칠 수 없어요/)).toBeInTheDocument();
  });

  it("still takes edits after applications closed while edits are open", async () => {
    const { formId } = applied();
    setAccepting(EVENT, formId, OWNER, { acceptingApplications: false });
    openApp();
    expect(await within(await screen.findByRole("region", { name: "내 신청" })).findByRole("link", { name: "고치기" })).toBeInTheDocument();
  });

  it("goes back to read-only when edits close while editing", async () => {
    const { formId } = applied();
    openApp(`/participate/${EVENT}/me/edit`);
    await screen.findByRole("heading", { name: "신청 고치기" });
    setAccepting(EVENT, formId, OWNER, { acceptingEdits: false });
    fireEvent.change(screen.getByLabelText(/^또래/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByText("지금은 신청을 고칠 수 없어서 저장하지 못했어요.")).toBeInTheDocument();
    expect(within(applicationCard()).queryByRole("link", { name: "고치기" })).not.toBeInTheDocument();
    expect(readOwnApplication()?.revision).toBe(1);
  });

  it("loads the newer answers when someone else saved first", async () => {
    const { ids, participantId } = applied();
    openApp(`/participate/${EVENT}/me/edit`);
    await screen.findByRole("heading", { name: "신청 고치기" });
    reviseAsSomeoneElse(participantId, ids.COHORT, { text: "93" });
    fireEvent.change(screen.getByLabelText(/^또래/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByText(/다른 곳에서 신청이 바뀌었어요/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^또래/)).toHaveValue("93");
    fireEvent.change(screen.getByLabelText(/^또래/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByText("신청을 고쳤어요.")).toBeInTheDocument();
    expect(readOwnApplication()?.revision).toBe(3);
  });

  it("says there is no application on 404", async () => {
    applied();
    server.use(http.get("/api/v1/participant/application", () => HttpResponse.json({ code: "RESOURCE_NOT_FOUND" }, { status: 404 })));
    openApp();
    expect(await screen.findByText(/신청이 없어요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("changes the six-digit number with the current one", async () => {
    applied();
    openApp();
    fireEvent.click(await screen.findByRole("button", { name: "숫자 6자리 바꾸기" }));
    fireEvent.change(screen.getByLabelText("지금 숫자 6자리"), { target: { value: "111222" } });
    fireEvent.change(screen.getByLabelText("숫자 6자리"), { target: { value: "481207" } });
    fireEvent.change(screen.getByLabelText("한 번 더"), { target: { value: "481207" } });
    fireEvent.click(screen.getByRole("button", { name: "번호 바꾸기" }));
    expect(await screen.findByText("지금 숫자 6자리가 맞지 않아요.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("지금 숫자 6자리"), { target: { value: "730914" } });
    fireEvent.click(screen.getByRole("button", { name: "번호 바꾸기" }));
    expect(await screen.findByText(/번호를 바꿨어요/)).toBeInTheDocument();
  });

  it("logs out to the sign-in screen", async () => {
    applied();
    openApp();
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("heading", { name: "나갔어요" })).toBeInTheDocument();
  });
});
