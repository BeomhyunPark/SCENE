import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localUsers } from "../mocks/fixtures/seed";
import { operatorRequests } from "../mocks/operatorStore";

const [OWNER] = localUsers.map((user) => user.userId);

function Where() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="where">{location.pathname}</p>
      <button type="button" onClick={() => navigate(-1)}>
        뒤로
      </button>
    </>
  );
}

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  );
}

const sidebar = () => within(screen.getByRole("navigation", { name: "운영 메뉴" }));
const bar = () => within(screen.getByRole("navigation", { name: "주요 메뉴" }));

describe("organization menus outside an event (#376)", () => {
  it("opens 멤버 from the sidebar and goes back to the event list, never into an event", async () => {
    await login({ userId: OWNER });
    openApp("/events");
    await screen.findByRole("heading", { name: "Local space의 행사" });
    for (const label of ["준비 업무", "현장 운영", "참가 현황", "운영 멤버"]) {
      expect(sidebar().queryByRole("link", { name: label })).not.toBeInTheDocument();
      expect(bar().queryByRole("link", { name: label })).not.toBeInTheDocument();
    }

    fireEvent.click(sidebar().getByRole("link", { name: "멤버" }));
    expect(await screen.findByRole("list", { name: "멤버" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/members");
    expect(screen.getByRole("button", { name: "멤버 초대" })).toBeInTheDocument();
    expect(sidebar().getByRole("link", { name: "멤버" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/events$/);
  });

  it("opens 멤버 from the phone bottom bar", async () => {
    await login({ userId: OWNER });
    openApp("/events");
    await screen.findByRole("heading", { name: "Local space의 행사" });
    fireEvent.click(bar().getByRole("link", { name: "멤버" }));
    expect(await screen.findByRole("list", { name: "멤버" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/members");
  });

  it.each(["/field", "/tasks", "/participants", "/operators"])("sends the old organization link %s to the event list", async (path) => {
    await login({ userId: OWNER });
    openApp(path);
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/events$/);
  });

  it("keeps 조직에서 나가기 in settings without the member list", async () => {
    await login({ userId: OWNER });
    openApp("/settings");
    expect(await screen.findByRole("heading", { name: "조직에서 나가기" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "멤버" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "멤버 초대" })).not.toBeInTheDocument();
    await waitFor(() => expect(operatorRequests.some((request) => request.url.includes("/members"))).toBe(false));
  });
});
