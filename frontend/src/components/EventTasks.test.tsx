import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests } from "../mocks/operatorStore";
import { EventTasks } from "./EventTasks";

function renderTasks() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/events/${localEvent.eventId}/tasks`]}>
        <Routes>
          <Route path="/events/:eventId/tasks" element={<EventTasks />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("event tasks", () => {
  it("renders the list and adds a task without a sort query", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks();
    expect(await screen.findByRole("button", { name: /안내문 출력/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.change(await screen.findByRole("textbox", { name: "업무 제목" }), {
      target: { value: "간식 구매" },
    });
    fireEvent.click(screen.getByRole("button", { name: "업무 추가" }));
    expect(await screen.findByRole("button", { name: /간식 구매/ })).toBeInTheDocument();
    const listed = operatorRequests.find((request) => request.method === "GET" && request.url.includes("/tasks"));
    expect(listed?.url).not.toContain("sort");
    const created = operatorRequests.find((request) => request.method === "POST" && request.url.endsWith("/tasks"));
    expect(created?.body).toEqual({ title: "간식 구매" });
  });

  it("hides the composer when the operator cannot write tasks", async () => {
    await login({ userId: localUsers[2].userId });
    renderTasks();
    expect(await screen.findByRole("button", { name: /안내문 출력/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "업무 제목" })).not.toBeInTheDocument();
  });
});
