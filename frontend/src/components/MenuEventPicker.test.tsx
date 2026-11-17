import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import type { LifecycleStatus } from "../api/events";
import { localEvent, localSpace } from "../mocks/fixtures/seed";
import { addEvent, setLifecycle } from "../mocks/operatorStore";

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
      <Where />
    </MemoryRouter>,
  );
}

function seed(eventId: string, name: string, lifecycleStatus: LifecycleStatus) {
  addEvent({
    eventId,
    spaceId: localSpace.spaceId,
    name,
    lifecycleStatus,
    lifecycleVersion: 0,
    startDate: null,
    endDate: null,
    place: null,
    eventType: null,
  });
}

async function signInAndOpen(menu: string) {
  renderApp();
  fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
  await screen.findByRole("heading", { name: "Local space의 행사" });
  fireEvent.click(screen.getByRole("link", { name: menu }));
}

describe("organization menus that live inside an event", () => {
  it("opens the only open event directly", async () => {
    seed("00000000-0000-4000-8000-0000000000e1", "지난 행사", "ENDED");
    await signInAndOpen("참가 현황");
    expect(await screen.findByTestId("where")).toHaveTextContent(`/events/${localEvent.eventId}/participants`);
  });

  it("lists open events to pick from and leaves out ended and archived ones", async () => {
    seed("00000000-0000-4000-8000-0000000000e2", "겨울 수련회", "ACTIVE");
    seed("00000000-0000-4000-8000-0000000000e3", "지난 행사", "ENDED");
    seed("00000000-0000-4000-8000-0000000000e4", "보관 행사", "ARCHIVED");
    await signInAndOpen("준비 업무");
    expect(await screen.findByRole("heading", { name: "어느 행사의 준비 업무를 볼까요?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Local event" })).toHaveAttribute(
      "href",
      `/events/${localEvent.eventId}/tasks`,
    );
    expect(screen.getByRole("link", { name: "겨울 수련회" })).toHaveAttribute(
      "href",
      "/events/00000000-0000-4000-8000-0000000000e2/tasks",
    );
    expect(screen.queryByRole("link", { name: "지난 행사" })).toBeNull();
    expect(screen.queryByRole("link", { name: "보관 행사" })).toBeNull();
    expect(screen.getByRole("link", { name: "준비 업무" })).toHaveAttribute("aria-current", "page");
  });

  it("says there is no open event when every event has ended", async () => {
    setLifecycle(localEvent.eventId, "ENDED", 1);
    await signInAndOpen("운영 멤버");
    expect(await screen.findByRole("heading", { name: "진행 중인 행사가 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "행사 목록으로" })).toHaveAttribute("href", "/events");
  });

  it("sends 현장 운영 to the only open event's field page", async () => {
    await signInAndOpen("현장 운영");
    expect(await screen.findByTestId("where")).toHaveTextContent(`/events/${localEvent.eventId}/field`);
  });

  it("uses the right particle in the picker heading", async () => {
    seed("00000000-0000-4000-8000-0000000000e5", "겨울 수련회", "ACTIVE");
    await signInAndOpen("현장 운영");
    expect(await screen.findByRole("heading", { name: "어느 행사의 현장 운영을 볼까요?" })).toBeInTheDocument();
  });
});
