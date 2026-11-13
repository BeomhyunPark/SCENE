import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";

const NOT_READY = "이메일·Google 로그인은 아직 준비 중이에요.";
const DEV_HINT = "개발 중에는 아래 개발용 로그인으로 들어가요.";

async function renderLogin(entry = "/login") {
  const { PublicLogin } = await import("./PublicLogin");
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<PublicLogin />} />
          <Route path="/events" element={<p>행사 목록 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function statusTexts(): string[] {
  return screen
    .getAllByRole("status")
    .map((region) => region.textContent ?? "")
    .filter((text) => text !== "");
}

describe("PublicLogin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not render the dev login panel when DEV is off", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEV_LOGIN", "1");
    await renderLogin("/login?next=/events");
    expect(screen.queryByRole("heading", { name: "개발용 로그인" })).not.toBeInTheDocument();
    expect(screen.queryByText(DEV_HINT)).not.toBeInTheDocument();
  });

  it("keeps the login submit on /login and says email login is not ready", async () => {
    await renderLogin();
    expect(screen.queryByText(NOT_READY)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "owner@scene.local" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(statusTexts()).toContain(NOT_READY);
    expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    expect(screen.queryByText("행사 목록 화면")).not.toBeInTheDocument();
  });

  it("keeps the Google button on /login and says Google login is not ready", async () => {
    await renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(statusTexts()).toContain(NOT_READY);
    expect(screen.getByRole("heading", { name: "다시 만나서 반가워요" })).toBeInTheDocument();
    expect(screen.queryByText("행사 목록 화면")).not.toBeInTheDocument();
  });

  it("shows only the format error when the email is malformed", async () => {
    await renderLogin();
    // "a@b" passes the browser's own type=email check, so the submit handler runs.
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "a@b" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(screen.getByRole("alert")).toHaveTextContent("이메일 형식을 확인해 주세요.");
    expect(screen.queryByText(NOT_READY)).not.toBeInTheDocument();
    expect(screen.queryByText(DEV_HINT)).not.toBeInTheDocument();
    expect(screen.queryByText("행사 목록 화면")).not.toBeInTheDocument();
  });

  it("leaves the dev login sentence out of the notice when DEV is off", async () => {
    vi.stubEnv("DEV", false);
    await renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(statusTexts()).toEqual([NOT_READY]);
    expect(screen.queryByText(/개발용 로그인/)).not.toBeInTheDocument();
    expect(screen.queryByText("행사 목록 화면")).not.toBeInTheDocument();
  });

  it("points to the dev login below the notice when DEV is on", async () => {
    vi.stubEnv("DEV", true);
    await renderLogin();
    expect(screen.queryByText(DEV_HINT)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(statusTexts()).toEqual([NOT_READY, DEV_HINT]);
    expect(await screen.findByRole("heading", { name: "개발용 로그인" })).toBeInTheDocument();
  });
});
