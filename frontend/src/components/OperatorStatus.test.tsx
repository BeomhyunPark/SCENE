import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { loadingTitle } from "./operatorMenu";
import { OperatorStatus } from "./RequireOperator";

function renderAt(path: string, title?: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <OperatorStatus busy message="불러오는 중이에요." title={title} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

// #524: an address opened directly or refreshed no longer flashes "행사" while it loads.
describe("loading title", () => {
  it.each([
    ["/events", "행사"],
    ["/notifications", "알림"],
    ["/members", "멤버"],
    ["/settings", "설정"],
    ["/history", "기록"],
    ["/integrations", "연동"],
  ])("shows the menu title of %s while it loads", (path, title) => {
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중이에요.");
  });

  it.each(["/events/event-1", "/events/event-1/field", "/events/event-1/participants", "/events/new"])(
    "leaves the title of %s blank until the page knows it",
    (path) => {
      renderAt(path);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^$/);
    },
  );

  it("uses the title the page passes", () => {
    renderAt("/events/event-1/tasks/task-1", "준비 업무");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("준비 업무");
  });

  it("matches only the exact organization address", () => {
    expect(loadingTitle("/members")).toBe("멤버");
    expect(loadingTitle("/members/x")).toBe("");
    expect(loadingTitle("/")).toBe("");
  });
});
