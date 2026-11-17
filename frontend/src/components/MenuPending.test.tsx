import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { MenuPending } from "./MenuPending";

function renderPending(path: string, title: string, needsEvent = false) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <MenuPending title={title} needsEvent={needsEvent} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("menu pending page", () => {
  it("says the menu is not ready and links back to the event list", () => {
    renderPending("/schedule", "일정");
    expect(screen.getByRole("heading", { level: 1, name: "일정" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "아직 준비 중이에요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "행사 목록으로" })).toHaveAttribute("href", "/events");
    expect(screen.getByRole("link", { name: "일정" })).toHaveAttribute("aria-current", "page");
  });

  it("asks to pick an event for menus that live inside an event", () => {
    renderPending("/participants", "참가자", true);
    expect(screen.getByRole("heading", { name: "행사를 고른 뒤 쓸 수 있어요" })).toBeInTheDocument();
    expect(screen.getByText("참가자는 행사 안에서 열려요. 행사 목록에서 행사를 골라 주세요.")).toBeInTheDocument();
  });
});
