import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { OperatorShell } from "./OperatorShell";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/events/:eventId/*"
          element={
            <OperatorShell
              title="Local event"
              spaceName="Local space"
              eventName="Local event"
              eventHref="/events/e1"
              eventAreas={["participants", "tasks"]}
              participantsHref="/events/e1/participants"
              tasksHref="/events/e1/tasks"
            >
              <p>본문</p>
            </OperatorShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("operator shell", () => {
  it("highlights the participants item on the participants page", () => {
    renderAt("/events/e1/participants");
    expect(screen.getByRole("link", { name: "참가자" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Local event" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the participants item current on the setup page", () => {
    renderAt("/events/e1/participants/setup");
    expect(screen.getByRole("link", { name: "참가자" })).toHaveAttribute("aria-current", "page");
  });

  it("highlights the event on its home and tasks on the task list", () => {
    renderAt("/events/e1");
    expect(screen.getByRole("link", { name: "Local event" })).toHaveAttribute("aria-current", "page");
    cleanup();
    renderAt("/events/e1/tasks/task-1");
    expect(screen.getByRole("link", { name: "준비 업무" })).toHaveAttribute("aria-current", "page");
  });
});
