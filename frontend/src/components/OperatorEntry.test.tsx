import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createEvent } from "../api/events";
import { isApiError } from "../api/errors";
import { getMe, login } from "../api/session";
import { localUsers } from "../mocks/fixtures/seed";
import { server } from "../mocks/server";
import { operatorRequests } from "../mocks/operatorStore";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

async function signIn() {
  renderAt("/login");
  fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
  expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
}

describe("operator entry", () => {
  it("sends an anonymous visit to login", async () => {
    renderAt("/events");
    expect(await screen.findByRole("heading", { name: "SCENE 시작하기" })).toBeInTheDocument();
    expect(screen.getByText("개발 중에는 아래 개발용 로그인으로 들어가요.")).toBeInTheDocument();
  });

  it("shows the space name and the seeded event after dev login", async () => {
    await signIn();
    expect(await screen.findByText("1개의 행사")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Local event/ })).toBeInTheDocument();
    // The line that repeated the "행사" title is gone (#483).
    expect(screen.queryByText("준비 중인 행사와 종료된 기록을 한곳에서 관리해요.")).toBeNull();
  });

  it("creates an event with the retreat code and shows the server dates", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "새 행사" }));
    expect(await screen.findByRole("heading", { name: "새 행사 만들기" })).toBeInTheDocument();
    // No guidance line under 기본 정보 that Figma P02-02 does not have (#495).
    expect(screen.queryByText(/최소 정보만/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "행사 유형 (선택)" }), {
      target: { value: "RETREAT" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "행사명" }), { target: { value: "가을 수련회" } });
    fireEvent.change(document.getElementById("event-start-picker")!, { target: { value: "2026-10-24" } });
    fireEvent.change(document.getElementById("event-end-picker")!, { target: { value: "2026-10-25" } });
    fireEvent.change(screen.getByRole("textbox", { name: "장소" }), { target: { value: "드림홀" } });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));
    expect(await screen.findByRole("heading", { name: "가을 수련회" })).toBeInTheDocument();
    expect(screen.getByText("2026년 10월 24일 – 2026년 10월 25일 · 드림홀")).toBeInTheDocument();
    const created = operatorRequests.find((request) => request.method === "POST");
    expect(created?.body).toEqual({
      name: "가을 수련회",
      startDate: "2026-10-24",
      endDate: "2026-10-25",
      place: "드림홀",
      eventType: "RETREAT",
    });
    await waitFor(() => {
      const read = operatorRequests.find(
        (request) => request.method === "GET" && request.url.startsWith("/api/v1/operator/events/"),
      );
      expect(read?.response).toMatchObject({ eventType: "RETREAT" });
    });
  });

  it("keeps the form on the page when the place is rejected", async () => {
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/events", () =>
        HttpResponse.json(
          {
            type: "urn:scene:problem:validation-failed",
            title: "Validation failed",
            status: 400,
            detail: "hidden",
            code: "VALIDATION_FAILED",
            traceId: "mock-trace",
            errors: [{ field: "place" }],
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "새 행사" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "행사명" }), {
      target: { value: "가을 수련회" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "장소" }), { target: { value: "드림홀" } });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("장소를 확인해 주세요.");
    expect(screen.getByRole("heading", { name: "새 행사 만들기" })).toBeInTheDocument();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("shows the empty organization state", async () => {
    server.use(
      http.get("/api/v1/operator/spaces", () =>
        HttpResponse.json({
          items: [],
          page: { number: 0, size: 50, totalItems: 0, totalPages: 0 },
        }),
      ),
      // No organization and no event either (#387): a collaborator would see 협력 중인 행사 instead.
      http.get("/api/v1/operator/events", () =>
        HttpResponse.json({
          items: [],
          page: { number: 0, size: 100, totalItems: 0, totalPages: 0 },
        }),
      ),
    );
    renderAt("/login");
    fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
    expect(await screen.findByText("아직 들어간 조직이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "조직 찾기" })).toHaveAttribute("href", "/find-organization");
  });

  it("signs out from the sidebar and asks for login again", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("heading", { name: "SCENE 시작하기" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Local space의 행사" })).toBeNull();
    await expect(getMe()).rejects.toMatchObject({ status: 401 });
  });

  it("stays signed in and says so when sign-out fails", async () => {
    await signIn();
    server.use(http.post("/api/v1/operator/auth/logout", () => HttpResponse.error()));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("로그아웃하지 못했어요. 다시 시도해 주세요.");
    expect(screen.getByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
  });

  it("treats an already ended session as signed out", async () => {
    await signIn();
    server.use(
      http.post("/api/v1/operator/auth/logout", () =>
        HttpResponse.json({ status: 401, code: "AUTHENTICATION_REQUIRED" }, { status: 401 }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("heading", { name: "SCENE 시작하기" })).toBeInTheDocument();
  });

  it("says when the event cannot be found", async () => {
    await login({ userId: localUsers[0].userId });
    renderAt("/events/00000000-0000-4000-8000-000000000099");
    expect(await screen.findByText("행사를 찾을 수 없어요")).toBeInTheDocument();
  });

  it("omits an unchosen type and shows a type error from the server", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "새 행사" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "행사명" }), {
      target: { value: "이름만" },
    });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));
    expect(await screen.findByRole("heading", { name: "이름만" })).toBeInTheDocument();
    const created = operatorRequests.find((request) => request.method === "POST");
    expect(created?.body).toEqual({ name: "이름만" });
    expect(created?.response).toMatchObject({ eventType: null });
    expect(getItem.mock.calls.some(([key]) => String(key).startsWith("scene-event-type"))).toBe(false);
    expect(sessionStorage.getItem("scene-event-type:이름만")).toBeNull();

    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/events", () =>
        HttpResponse.json(
          {
            type: "urn:scene:problem:validation-failed",
            title: "Validation failed",
            status: 400,
            code: "VALIDATION_FAILED",
            errors: [{ field: "eventType" }],
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    fireEvent.click(screen.getByRole("link", { name: "행사 목록" }));
    fireEvent.click(await screen.findByRole("button", { name: "새 행사" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "행사명" }), {
      target: { value: "다시" },
    });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));
    expect(await screen.findByText("행사 유형을 다시 골라 주세요.")).toBeInTheDocument();
    getItem.mockRestore();
  });

  it("gives a space MEMBER no create entry and a notice on /events/new (DEC-077)", async () => {
    const member = localUsers[4].userId;
    await login({ userId: member });
    const list = renderAt("/events");
    expect(await screen.findByRole("heading", { name: "아직 운영하는 행사가 없어요" })).toBeInTheDocument();
    expect(screen.getByText("관리자가 만든 행사에 운영자로 추가되면 여기에 보여요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 행사" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "첫 행사 만들기" })).not.toBeInTheDocument();
    list.unmount();

    renderAt("/events/new");
    expect(
      await screen.findByText("행사는 조직 관리자가 만들어요. 관리자가 만든 행사에 운영자로 추가되면 행사 목록에 보여요."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "행사명" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "행사 만들기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "행사 목록으로" }));
    expect(await screen.findByRole("heading", { name: "아직 운영하는 행사가 없어요" })).toBeInTheDocument();

    // The mock answers like the server: a MEMBER's create is FORBIDDEN and stores nothing.
    const spaces = await (await fetch("/api/v1/operator/spaces")).json();
    const refused = await createEvent(spaces.items[0].spaceId, { name: "멤버 행사" }).catch((error: unknown) => error);
    expect(isApiError(refused, "FORBIDDEN")).toBe(true);
  });

  it("shows a refusal when the server forbids the create (DEC-077)", async () => {
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/events", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Forbidden", status: 403, code: "FORBIDDEN", traceId: "mock-trace" },
          { status: 403, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "새 행사" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "행사명" }), { target: { value: "가을 수련회" } });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));
    expect(await screen.findByText("행사는 조직 관리자만 만들 수 있어요.")).toBeInTheDocument();
  });
});
