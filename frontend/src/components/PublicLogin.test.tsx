import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { logout } from "../api/session";
import { currentOperator } from "../mocks/handlers/session";

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="path">{`${location.pathname}${location.search}`}</p>
      <button type="button" onClick={() => navigate(-1)}>
        뒤로
      </button>
      <button type="button" onClick={() => navigate("/login")}>
        로그인 화면
      </button>
    </>
  );
}

function renderLogin(entries: string[] = ["/", "/login"]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <App />
      <Probe />
    </MemoryRouter>,
  );
}

function signInWith(email: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
}

describe("local email login", () => {
  it("signs a seed account in and replaces the login entry", async () => {
    renderLogin();
    signInWith("Owner@Scene.local");
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
    expect(currentOperator()?.displayName).toBe("Local owner");

    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("follows a same-origin next", async () => {
    renderLogin(["/login?next=%2Fsettings"]);
    signInWith("owner@scene.local");
    expect(await screen.findByText("/settings")).toBeInTheDocument();
  });

  it("stays on the login screen for an unknown email without calling the server", async () => {
    renderLogin();
    signInWith("someone@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "로컬 계정이 아니에요. 아래 계정 이메일로 들어가 주세요.",
    );
    expect(screen.getByTestId("path")).toHaveTextContent("/login");
    expect(currentOperator()).toBeNull();
  });

  it("keeps Google on the login screen", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(screen.getByRole("status")).toHaveTextContent("Google 로그인은 아직 준비 중이에요. 이메일로 들어가 주세요.");
    expect(screen.getByTestId("path")).toHaveTextContent("/login");
  });

  it("switches accounts and still signs in after the session ends", async () => {
    renderLogin();
    signInWith("owner@scene.local");
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "로그인 화면" }));
    signInWith("manager@scene.local");
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
    expect(currentOperator()?.displayName).toBe("Local manager");

    await logout();
    fireEvent.click(screen.getByRole("button", { name: "로그인 화면" }));
    signInWith("staff@scene.local");
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
    expect(currentOperator()?.displayName).toBe("Local staff");
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/events$/);
  });
});
