import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { localEvent } from "../mocks/fixtures/seed";

describe("event sidebar pending menus", () => {
  it("shows the not-ready page inside the event and links back to it", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
    fireEvent.click(await screen.findByRole("button", { name: /Local event/ }));
    fireEvent.click(await screen.findByRole("link", { name: "다른 기능 시작" }));
    expect(await screen.findByRole("heading", { name: "아직 준비 중이에요" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "다른 기능 시작" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다른 기능 시작" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "행사로 돌아가기" })).toHaveAttribute(
      "href",
      `/events/${localEvent.eventId}`,
    );
  });

  it("opens the 현장 운영 check-in screen inside the event", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
    fireEvent.click(await screen.findByRole("button", { name: /Local event/ }));
    fireEvent.click(await screen.findByRole("link", { name: "현장 운영" }));
    expect(await screen.findByLabelText("이름 또는 전화 끝 4자리")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "현장 운영" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "현장 운영" })).toHaveAttribute(
      "href",
      `/events/${localEvent.eventId}/field`,
    );
  });
});
