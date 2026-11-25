import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { localEvent } from "../mocks/fixtures/seed";

/** Opens an address the way a typed or saved link would; the sidebar no longer offers it (#495). */
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      주소로 열기
    </button>
  );
}

describe("event sidebar pending menus", () => {
  it("hides 다른 기능 시작 but still explains its address inside the event and links back to it", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
        <GoTo to={`/events/${localEvent.eventId}/areas`} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "들어가기" }));
    fireEvent.click(await screen.findByRole("button", { name: /Local event/ }));
    await screen.findAllByRole("link", { name: "현장 운영" });
    expect(screen.queryByRole("link", { name: "다른 기능 시작" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "주소로 열기" }));
    expect(await screen.findByRole("heading", { name: "아직 준비 중이에요" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "다른 기능 시작" })).toBeInTheDocument();
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
    // The sidebar; the phone bottom bar repeats 현장 운영 and jsdom shows both.
    const sidebar = async () => within(await screen.findByRole("navigation", { name: "운영 메뉴" }));
    // Only the event sidebar has 현장 운영 (#376), so wait for the event to open.
    await screen.findAllByRole("link", { name: "현장 운영" });
    fireEvent.click((await sidebar()).getByRole("link", { name: "현장 운영" }));
    expect(await screen.findByLabelText("이름 또는 전화 끝 4자리")).toBeInTheDocument();
    expect((await sidebar()).getByRole("link", { name: "현장 운영" })).toHaveAttribute("aria-current", "page");
    expect((await sidebar()).getByRole("link", { name: "현장 운영" })).toHaveAttribute(
      "href",
      `/events/${localEvent.eventId}/field`,
    );
  });
});
