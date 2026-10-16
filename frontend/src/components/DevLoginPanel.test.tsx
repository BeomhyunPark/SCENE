import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";
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
});
