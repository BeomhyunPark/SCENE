import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { login } from "./api/session";
import { localUsers } from "./mocks/fixtures/seed";
import { server } from "./mocks/server";

// A production build: the join-request prototypes are replaced by the invitation notice (#356).
vi.mock("./prototypeScreens", () => ({ prototypeScreensEnabled: () => false }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("invitation notice in a production build", () => {
  it.each(["/find-organization", "/join-pending", "/register-organization"])(
    "shows the notice instead of the prototype on %s",
    (path) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      renderAt(path);

      expect(screen.getByRole("heading", { name: "초대 링크로 들어와 주세요" })).toBeInTheDocument();
      expect(screen.getByText(/조직 검색과 가입 요청은 아직 준비 중이에요/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /가입 요청/ })).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(document.body.textContent).not.toContain("드림공동체");
      expect(document.querySelector('a[href="/signup"]')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    },
  );

  it("goes back to the operator entry from the notice", async () => {
    renderAt("/find-organization");
    fireEvent.click(screen.getByRole("button", { name: "행사 화면으로" }));
    expect(await screen.findByRole("heading", { name: "SCENE 시작하기" })).toBeInTheDocument();
  });

  it("tells an operator without an organization to use an invitation link", async () => {
    server.use(
      http.get("/api/v1/operator/spaces", () =>
        HttpResponse.json({
          items: [],
          page: { number: 0, size: 50, totalItems: 0, totalPages: 0 },
        }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderAt("/events");

    expect(await screen.findByText("아직 들어간 조직이 없어요")).toBeInTheDocument();
    expect(screen.getByText("운영진에게 받은 초대 링크로 들어와 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "조직 찾기" })).toBeNull();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });
});
