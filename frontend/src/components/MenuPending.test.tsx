import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { MenuPending } from "./MenuPending";

function renderPending(path: string, title: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <MenuPending title={title} />
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
    // The menu itself is hidden until the screen exists (#495); the address still explains itself.
    expect(screen.queryByRole("link", { name: "일정" })).not.toBeInTheDocument();
  });
});
