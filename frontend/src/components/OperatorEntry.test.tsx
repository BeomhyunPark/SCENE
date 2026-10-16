import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
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
    expect(await screen.findByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    expect(screen.getByText("개발 중에는 아래 개발용 로그인으로 들어가요.")).toBeInTheDocument();
  });

  it("shows the space name and the seeded event after dev login", async () => {
    await signIn();
    expect(await screen.findByText("1개의 행사")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Local event/ })).toBeInTheDocument();
  });

  it("creates an event with the retreat code and shows the server dates", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "새 행사" }));
    expect(await screen.findByRole("heading", { name: "새 행사 만들기" })).toBeInTheDocument();
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
    );
    renderAt("/login");
    fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
    expect(await screen.findByText("아직 들어간 조직이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "조직 찾기" })).toHaveAttribute("href", "/find-organization");
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
});
