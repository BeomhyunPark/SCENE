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
const KEY = "participant-access-key";
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

  it("shows the return link once and does not store the key", async () => {
    const posted: unknown[] = [];
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    server.use(
      http.get("/api/v1/public/events/:eventId/forms/:formId", () => HttpResponse.json(formResponse())),
      http.post("/api/v1/public/events/:eventId/forms/:formId/applications", async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(
          { applicationId: "app-1", participantId: "person-1", accessKey: KEY },
          { status: 201 },
        );
      }),
    );
    await openApp(`/apply/${EVENT}/${FORM}`);
    fireEvent.change(await screen.findByLabelText("이름"), { target: { value: "김" } });
    fireEvent.change(screen.getByLabelText("전화"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    const link = await screen.findByRole("textbox", { name: "다시 들어오는 링크" });
    expect(link).toHaveValue(`${window.location.origin}/participate/${EVENT}#${encodeURIComponent(KEY)}`);
    expect(String((link as HTMLInputElement).value).split("#")[0]).not.toContain(KEY);
    expect(posted).toEqual([{ answers: [{ fieldId: NAME, text: "김" }, { fieldId: PHONE, text: "010-1234-5678" }] }]);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("enters from the key it just received", async () => {
    const posted: unknown[] = [];
    server.use(
      http.get("/api/v1/public/events/:eventId/forms/:formId", () => HttpResponse.json(formResponse())),
      http.post("/api/v1/public/events/:eventId/forms/:formId/applications", () =>
        HttpResponse.json({ applicationId: "app-1", participantId: "person-1", accessKey: KEY }, { status: 201 }),
      ),
      http.post("/api/v1/public/events/:eventId/participant-sessions", async ({ request }) => {
        posted.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/v1/participant/me", () =>
        HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김" }),
      ),
    );
    await openApp(`/apply/${EVENT}/${FORM}`);
    fireEvent.change(await screen.findByLabelText("이름"), { target: { value: "김" } });
    fireEvent.change(screen.getByLabelText("전화"), { target: { value: "01012345678" } });
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));
    fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
    expect(await screen.findByRole("heading", { name: "김님, 참가 신청이 됐어요." })).toBeInTheDocument();
    expect(posted).toEqual([{ accessKey: KEY }]);
    expect(screen.queryByText(KEY)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("heading", { name: "나갔어요" })).toBeInTheDocument();
  });

  it("strips the fragment before opening a session", async () => {
    const posted: unknown[] = [];
    server.use(
      http.post("/api/v1/public/events/:eventId/participant-sessions", async ({ request }) => {
        posted.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/v1/participant/me", () =>
        HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김" }),
      ),
    );
    window.location.hash = `#${encodeURIComponent(KEY)}`;
    await openApp(`/participate/${EVENT}`);
    expect(window.location.hash).toBe("");
    expect(await screen.findByRole("heading", { name: "김님, 참가 신청이 됐어요." })).toBeInTheDocument();
    expect(posted).toEqual([{ accessKey: KEY }]);
    expect(screen.queryByText(KEY)).not.toBeInTheDocument();
  });

  it("hides a rejected key and the problem detail", async () => {
    server.use(
      http.post("/api/v1/public/events/:eventId/participant-sessions", () => problem(401, "PARTICIPANT_ACCESS_INVALID")),
    );
    window.location.hash = `#${encodeURIComponent(KEY)}`;
    await openApp(`/participate/${EVENT}`);
    expect(await screen.findByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.queryByText(KEY)).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).not.toContain(KEY);
  });

  it("asks for the link when there is no session", async () => {
    server.use(http.get("/api/v1/participant/me", () => problem(401, "AUTHENTICATION_REQUIRED")));
    await openApp(`/participate/${EVENT}`);
    expect(await screen.findByRole("heading", { name: "링크가 필요해요" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
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
          items: [{ formId: FORM, acceptingApplications: true }],
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
  });

  it("hides the apply address until applications are open", async () => {
    server.use(
      http.get("/api/v1/operator/events/:eventId/forms", () =>
        HttpResponse.json({
          items: [{ formId: FORM, acceptingApplications: false }],
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
