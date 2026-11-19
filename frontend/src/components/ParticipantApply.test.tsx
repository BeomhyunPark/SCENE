import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { server } from "../mocks/server";

const EVENT = localEvent.eventId;
const FORM = "00000000-0000-4000-8000-0000000000aa";
const NAME = "00000000-0000-4000-8000-0000000000b1";
const PHONE = "00000000-0000-4000-8000-0000000000b2";
const PIN = "730914";
const SECRET = "hidden-server-detail";

function formResponse() {
  return {
    formId: FORM,
    fields: [
      { fieldId: NAME, kind: "SYSTEM", systemKey: "NAME", label: "이름", position: 0 },
      { fieldId: PHONE, kind: "SYSTEM", systemKey: "PHONE", label: "전화", position: 1 },
    ],
  };
}

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: "urn:scene:problem:test", title: code, status, detail: SECRET, code },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function enterPin(pin: string, again = pin) {
  fireEvent.change(screen.getByLabelText("숫자 6자리"), { target: { value: pin } });
  fireEvent.change(screen.getByLabelText("한 번 더"), { target: { value: again } });
}

function signedIn(pinChangeRequired = false) {
  return HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김", pinChangeRequired });
}

async function fillNameAndPhone() {
  fireEvent.change(await screen.findByLabelText(/^이름/), { target: { value: "김" } });
  fireEvent.change(screen.getByLabelText(/^전화/), { target: { value: "010-1234-5678" } });
}

async function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("participant apply", () => {
  beforeEach(() => {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn() },
      });
    }
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for the number twice, sends it once and is signed in right away", async () => {
    const posted: unknown[] = [];
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    server.use(
      http.get("/api/v1/public/events/:eventId/forms/:formId", () => HttpResponse.json(formResponse())),
      http.post("/api/v1/public/events/:eventId/forms/:formId/applications", async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ applicationId: "app-1", participantId: "person-1", revision: 1, revised: false, completionNotice: null }, { status: 201 });
      }),
      http.get("/api/v1/participant/me", () => signedIn()),
    );
    await openApp(`/apply/${EVENT}/${FORM}`);
    await fillNameAndPhone();

    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(await screen.findByText("숫자 6자리를 넣어 주세요.")).toBeInTheDocument();
    enterPin("123456");
    expect(screen.getByText("이어지는 숫자는 쓸 수 없어요.")).toBeInTheDocument();
    enterPin("111111");
    expect(screen.getByText("같은 숫자만 반복한 번호는 쓸 수 없어요.")).toBeInTheDocument();
    // 101234 is inside 01012345678.
    enterPin("101234");
    expect(screen.getByText("전화번호에 들어 있는 숫자는 쓸 수 없어요.")).toBeInTheDocument();
    enterPin(PIN, "730915");
    expect(screen.getByText("두 번호가 달라요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(posted).toEqual([]);

    enterPin(PIN);
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(await screen.findByRole("heading", { name: "신청했어요" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "안내" })).not.toBeInTheDocument();
    const address = screen.getByRole("textbox", { name: "참가자 주소" });
    expect(address).toHaveValue(`${window.location.origin}/participate/${EVENT}`);
    expect(posted).toEqual([{ pin: PIN, answers: [{ fieldId: NAME, text: "김" }, { fieldId: PHONE, text: "010-1234-5678" }] }]);
    expect(document.body.textContent ?? "").not.toContain(PIN);
    expect(setItem).not.toHaveBeenCalled();

    // The submit response opened the session, so the participant page is already signed in.
    fireEvent.click(screen.getByRole("link", { name: "내 신청 보기" }));
    expect(await screen.findByRole("heading", { name: "김님, 참가 신청이 됐어요." })).toBeInTheDocument();
  });

  it("shows the completion notice from the submit response as plain text", async () => {
    const notice = "참가비 3만원\n<a href=\"https://evil.example\">신한 110-000</a>\nhttps://example.com/pay";
    server.use(
      http.get("/api/v1/public/events/:eventId/forms/:formId", () => HttpResponse.json(formResponse())),
      http.post("/api/v1/public/events/:eventId/forms/:formId/applications", () =>
        HttpResponse.json(
          { applicationId: "app-1", participantId: "person-1", revision: 1, revised: false, completionNotice: notice },
          { status: 201 },
        ),
      ),
    );
    await openApp(`/apply/${EVENT}/${FORM}`);
    fireEvent.change(await screen.findByLabelText(/^이름/), { target: { value: "김" } });
    fireEvent.change(screen.getByLabelText(/^전화/), { target: { value: "010-1234-5678" } });
    enterPin(PIN);
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    const region = await screen.findByRole("region", { name: "안내" });
    const text = region.querySelector("p");
    expect(text?.textContent).toBe(notice);
    expect(region.querySelector("a")).toBeNull();
  });

  it("answers typed and conditional questions and sends typed values", async () => {
    const posted: unknown[] = [];
    const custom = (fieldId: string, position: number, rest: Record<string, unknown>) => ({
      fieldId,
      kind: "CUSTOM",
      systemKey: null,
      position,
      description: null,
      showWhen: null,
      hidden: false,
      required: false,
      ...rest,
    });
    server.use(
      http.get("/api/v1/public/events/:eventId/forms/:formId", () =>
        HttpResponse.json({
          formId: FORM,
          fields: [
            ...formResponse().fields,
            custom("f-attend", 2, {
              label: "참석 방식",
              answerType: "SINGLE_CHOICE",
              required: true,
              config: {
                options: [
                  { optionId: "o-full", label: "전체", group: null, hidden: false, showWhen: null },
                  { optionId: "o-part", label: "부분", group: null, hidden: false, showWhen: null },
                ],
                allowOther: false,
                display: "BUTTONS",
              },
            }),
            custom("f-arrive", 3, {
              label: "도착 예정 시각",
              answerType: "DATE",
              required: true,
              config: { includeTime: true, min: null, max: null },
              showWhen: { fieldId: "f-attend", optionIds: ["o-part"] },
            }),
            custom("f-meal", 4, {
              label: "식사",
              answerType: "MULTI_CHOICE",
              config: {
                options: [
                  { optionId: "o-lunch", label: "점심", group: "1월 22일", hidden: false, showWhen: null },
                  { optionId: "o-dinner", label: "저녁", group: "1월 22일", hidden: false, showWhen: null },
                ],
                allowOther: false,
                minSelect: 0,
                maxSelect: null,
              },
            }),
            custom("f-consent", 5, {
              label: "개인정보 수집에 동의합니다",
              answerType: "YES_NO",
              required: true,
              config: { style: "CONSENT", yesLabel: null, noLabel: null },
            }),
          ],
        }),
      ),
      http.post("/api/v1/public/events/:eventId/forms/:formId/applications", async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ applicationId: "app-1", participantId: "person-1", revision: 1, revised: false, completionNotice: null }, { status: 201 });
      }),
    );
    await openApp(`/apply/${EVENT}/${FORM}`);
    fireEvent.change(await screen.findByLabelText(/^이름/), { target: { value: "김" } });
    fireEvent.change(screen.getByLabelText(/^전화/), { target: { value: "010-1234-5678" } });
    expect(screen.queryByLabelText(/^도착 예정 시각/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "부분" }));
    expect(screen.getByLabelText(/^도착 예정 시각/)).toBeInTheDocument();
    expect(screen.getByText("1월 22일")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(await screen.findByText("답하지 않았거나 확인이 필요한 질문이 있어요.")).toBeInTheDocument();
    expect(screen.getByText("동의해야 신청할 수 있어요.")).toBeInTheDocument();
    expect(posted).toEqual([]);

    fireEvent.change(screen.getByLabelText(/^도착 예정 시각/), { target: { value: "2027-01-22T19:30" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "저녁" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /개인정보 수집에 동의합니다/ }));
    enterPin(PIN);
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    await screen.findByRole("heading", { name: "신청했어요" });
    expect(posted).toEqual([
      {
        pin: PIN,
        answers: [
          { fieldId: NAME, text: "김" },
          { fieldId: PHONE, text: "010-1234-5678" },
          { fieldId: "f-attend", value: { optionId: "o-part" } },
          { fieldId: "f-arrive", value: { dateTime: "2027-01-22T19:30" } },
          { fieldId: "f-meal", value: { optionIds: ["o-dinner"] } },
          { fieldId: "f-consent", value: { value: true } },
        ],
      },
    ]);
  });

  it("tells an applied phone with another number that it already applied", async () => {
    server.use(
      http.get("/api/v1/public/events/:eventId/forms/:formId", () => HttpResponse.json(formResponse())),
      http.post("/api/v1/public/events/:eventId/forms/:formId/applications", () => problem(409, "APPLICATION_ALREADY_EXISTS")),
    );
    await openApp(`/apply/${EVENT}/${FORM}`);
    await fillNameAndPhone();
    enterPin(PIN);
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(await screen.findByText(/이 전화번호로 이미 신청했어요/)).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("says the application was edited when the same phone and number apply again", async () => {
    server.use(
      http.get("/api/v1/public/events/:eventId/forms/:formId", () => HttpResponse.json(formResponse())),
      http.post("/api/v1/public/events/:eventId/forms/:formId/applications", () =>
        HttpResponse.json({ applicationId: "app-2", participantId: "person-1", revision: 2, revised: true, completionNotice: null }),
      ),
    );
    await openApp(`/apply/${EVENT}/${FORM}`);
    await fillNameAndPhone();
    enterPin(PIN);
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    expect(await screen.findByRole("heading", { name: "신청을 고쳤어요" })).toBeInTheDocument();
  });

  it("signs in on the participant address with name, phone and number", async () => {
    const posted: unknown[] = [];
    let inside = false;
    server.use(
      http.get("/api/v1/participant/me", () => (inside ? signedIn() : problem(401, "AUTHENTICATION_REQUIRED"))),
      http.post("/api/v1/public/events/:eventId/participant-sessions", async ({ request }) => {
        posted.push(await request.json());
        inside = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("/api/v1/participant/auth/logout", () => {
        inside = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await openApp(`/participate/${EVENT}`);
    expect(await screen.findByRole("heading", { name: "내 신청 보기" })).toBeInTheDocument();
    expect(screen.queryByText(/링크/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    expect(screen.getByText("이름, 전화번호, 숫자 6자리를 모두 넣어 주세요.")).toBeInTheDocument();
    expect(posted).toEqual([]);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: " 김 " } });
    fireEvent.change(screen.getByLabelText("전화번호"), { target: { value: "010-1234-5678" } });
    fireEvent.change(screen.getByLabelText("숫자 6자리"), { target: { value: "73-09-14" } });
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    expect(await screen.findByRole("heading", { name: "김님, 참가 신청이 됐어요." })).toBeInTheDocument();
    expect(posted).toEqual([{ name: "김", phone: "010-1234-5678", pin: PIN }]);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("heading", { name: "나갔어요" })).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
  });

  it("gives one message for any wrong part and says how long a lock lasts", async () => {
    let attempt = 0;
    server.use(
      http.get("/api/v1/participant/me", () => problem(401, "AUTHENTICATION_REQUIRED")),
      http.post("/api/v1/public/events/:eventId/participant-sessions", () => {
        attempt += 1;
        if (attempt === 1) return problem(401, "PARTICIPANT_LOGIN_FAILED");
        return HttpResponse.json(
          { type: "urn:scene:problem:test", title: "x", status: 429, detail: SECRET, code: "PARTICIPANT_LOGIN_LOCKED", retryAfterSeconds: 600 },
          { status: 429, headers: { "Content-Type": "application/problem+json" } },
        );
      }),
    );
    await openApp(`/participate/${EVENT}`);
    fireEvent.change(await screen.findByLabelText("이름"), { target: { value: "김" } });
    fireEvent.change(screen.getByLabelText("전화번호"), { target: { value: "010-1234-5678" } });
    fireEvent.change(screen.getByLabelText("숫자 6자리"), { target: { value: "482915" } });
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이름, 전화번호, 숫자 6자리를 다시 확인해 주세요.");
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    expect(await screen.findByText(/10분 뒤에 다시 해 주세요/)).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("makes a temporary-number session set a new number before the participant home", async () => {
    const posted: unknown[] = [];
    let temporary = true;
    server.use(
      http.get("/api/v1/participant/me", () => signedIn(temporary)),
      http.put("/api/v1/participant/pin", async ({ request }) => {
        posted.push(await request.json());
        temporary = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await openApp(`/participate/${EVENT}`);
    expect(await screen.findByRole("heading", { name: "새 숫자 6자리를 정해 주세요" })).toBeInTheDocument();
    enterPin("654321");
    fireEvent.click(screen.getByRole("button", { name: "번호 정하기" }));
    expect(screen.getByText("이어지는 숫자는 쓸 수 없어요.")).toBeInTheDocument();
    expect(posted).toEqual([]);
    enterPin("904172");
    fireEvent.click(screen.getByRole("button", { name: "번호 정하기" }));
    expect(await screen.findByRole("heading", { name: "김님, 참가 신청이 됐어요." })).toBeInTheDocument();
    expect(posted).toEqual([{ newPin: "904172" }]);
  });

  it("shows a closed form without the problem detail", async () => {
    server.use(http.get("/api/v1/public/events/:eventId/forms/:formId", () => problem(409, "FORM_CLOSED")));
    await openApp(`/apply/${EVENT}/${FORM}`);
    expect(await screen.findByRole("heading", { name: "신청을 받지 않아요" })).toBeInTheDocument();
    expect(screen.getByText("지금은 신청을 받지 않아요.")).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("lets an operator copy the apply address without a key", async () => {
    server.use(
      http.get("/api/v1/operator/events/:eventId/forms", () =>
        HttpResponse.json({
          items: [{ formId: FORM, acceptingApplications: true, acceptingEdits: true }],
          page: { number: 0, size: 20, totalItems: 1, totalPages: 1 },
        }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    await openApp(`/events/${EVENT}/participants`);
    const address = await screen.findByRole("textbox", { name: "신청 주소" });
    expect(address).toHaveValue(`${window.location.origin}/apply/${EVENT}/${FORM}`);
    expect((address as HTMLInputElement).value).not.toContain("#");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/apply/${EVENT}/${FORM}`);
    // DEC-078 §8: the one participant address, with its QR, for the group chat.
    const participant = screen.getByRole("textbox", { name: "참가자 주소" });
    expect(participant).toHaveValue(`${window.location.origin}/participate/${EVENT}`);
    expect(screen.getByRole("img", { name: "참가자 주소 QR" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "주소 복사" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/participate/${EVENT}`);
  });

  it("hides the apply address until applications are open", async () => {
    server.use(
      http.get("/api/v1/operator/events/:eventId/forms", () =>
        HttpResponse.json({
          items: [{ formId: FORM, acceptingApplications: false, acceptingEdits: true }],
          page: { number: 0, size: 20, totalItems: 1, totalPages: 1 },
        }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    await openApp(`/events/${EVENT}/participants`);
    expect(await screen.findByText("신청을 열면 주소를 복사할 수 있어요.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "신청 주소" })).not.toBeInTheDocument();
  });
});
