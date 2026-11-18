import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";

const DEV_HINT = "개발 중에는 아래 개발용 로그인으로 들어가요.";

async function renderLogin(entry = "/login") {
  const { PublicLogin } = await import("./PublicLogin");
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<PublicLogin />} />
          <Route path="/events" element={<p>행사 목록 화면</p>} />
          <Route path="/login/done" element={<p>시작하는 화면</p>} />
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
    vi.useRealTimers();
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

  it("offers one Google button that covers both login and a new account", async () => {
    vi.stubEnv("DEV", false);
    await renderLogin();
    expect(screen.getByRole("heading", { name: "SCENE 시작하기" })).toBeInTheDocument();
    expect(screen.getByText("Google 계정으로 로그인해요. 처음이면 이때 계정이 만들어져요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google 계정으로 계속하기" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("link", { name: "처음 화면으로" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "계정 만들기" })).toBeNull();
    expect(screen.queryByText("행사 목록 화면")).not.toBeInTheDocument();
  });

  it("says it is moving, then starts Google sign-in with the page to return to", async () => {
    const google = await import("../api/googleSignIn");
    const start = vi.spyOn(google, "startGoogleSignIn").mockImplementation(() => undefined);
    await renderLogin("/login?next=%2Foperator%2Finvitations");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 계속하기" }));
    expect(screen.getByText("Google로 이동하는 중이에요")).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(start).toHaveBeenCalledWith("/operator/invitations");
    expect(screen.queryByText("행사 목록 화면")).not.toBeInTheDocument();
  });

  it("signs in a sample operator and continues on the mock API", async () => {
    vi.stubEnv("VITE_API_MOCK", "1");
    const google = await import("../api/googleSignIn");
    const start = vi.spyOn(google, "startGoogleSignIn").mockImplementation(() => undefined);
    const mock = await import("../mocks/mockGoogleSignIn");
    const signIn = vi.spyOn(mock, "mockGoogleSignIn").mockResolvedValue(undefined);
    await renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 계속하기" }));
    expect(await screen.findByText("시작하는 화면", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(signIn).toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("explains a Google sign-in that came back with an error", async () => {
    await renderLogin("/login?error=google_unverified");
    expect(statusTexts()).toContain("Google에서 이메일이 확인된 계정만 로그인할 수 있어요.");
  });

  it("points to the dev login when DEV is on and a page is waiting", async () => {
    vi.stubEnv("DEV", true);
    await renderLogin("/login?next=/events");
    expect(statusTexts()).toContain(DEV_HINT);
    expect(await screen.findByRole("heading", { name: "개발용 로그인" })).toBeInTheDocument();
  });

  it("leaves the dev login sentence out when DEV is off", async () => {
    vi.stubEnv("DEV", false);
    await renderLogin("/login?next=/events");
    expect(screen.queryByText(/개발용 로그인/)).not.toBeInTheDocument();
  });
});
