import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { DevLoginPanel } from "./DevLoginPanel";

function renderPanel() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <DevLoginPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="path">{location.pathname}</p>
      <button type="button" onClick={() => navigate(-1)}>
        뒤로
      </button>
    </>
  );
}

function renderLoginRoute(client: QueryClient = createQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/start", "/login"]} initialIndex={1}>
        <Routes>
          <Route path="/login" element={<DevLoginPanel />} />
          <Route path="*" element={null} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("dev login panel", () => {
  it("does not call fetch until submit, then shows the unknown-user message", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPanel();
    expect(screen.getByRole("heading", { name: "개발용 로그인" })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("시드 사용자"), { target: { value: "custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: "사용자 id" }), {
      target: { value: "00000000-0000-4000-8000-000000000099" },
    });
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이 사용자를 찾지 못했어요. id를 확인해 주세요.");
    fetchSpy.mockRestore();
  });

  it("replaces the login entry so Back does not return to the login screen", async () => {
    renderLoginRoute();
    fireEvent.click(screen.getByRole("button", { name: "들어가기" }));
    expect(await screen.findByText("/events")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/start");
    expect(screen.queryByRole("heading", { name: "개발용 로그인" })).not.toBeInTheDocument();
  });

  it("offers a way back into the operator screens when already signed in", () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.me, {
      userId: "00000000-0000-4000-8000-000000000001",
      displayName: "Local owner",
    });
    renderLoginRoute(client);

    expect(screen.getByText("Local owner 계정으로 들어가 있어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "행사로 가기" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/events");
  });
});
