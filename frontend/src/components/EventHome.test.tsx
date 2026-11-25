import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";

const EVENT = localEvent.eventId;
const WAIT = { timeout: 4000 };

/** The sidebar hides under 1024px; the event home is the way into 현장 운영 on a phone (#286). */
describe("event home shortcut to 현장 운영", () => {
  async function openHome(status: "DRAFT" | "ACTIVE" | "ENDED") {
    setLifecycle(EVENT, status, 2);
    await login({ userId: localUsers[0].userId });
    render(
      <MemoryRouter initialEntries={[`/events/${EVENT}`]}>
        <App />
      </MemoryRouter>,
    );
  }

  it("links an ACTIVE event home to 현장 운영", async () => {
    await openHome("ACTIVE");
    const link = await screen.findByRole("link", { name: /^현장 운영.*QR 스캔이나 이름으로/ }, WAIT);
    expect(link).toHaveAttribute("href", `/events/${EVENT}/field`);
    fireEvent.click(link);
    expect(await screen.findByRole("button", { name: "QR 스캔" }, WAIT)).toBeInTheDocument();
  });

  it.each(["DRAFT", "ENDED"] as const)("has no shortcut on a %s event", async (status) => {
    await openHome(status);
    await screen.findByRole("button", { name: "행사 설정" }, WAIT);
    expect(screen.queryByRole("link", { name: /^현장 운영.*QR 스캔이나 이름으로/ })).not.toBeInTheDocument();
  });
});

/** Figma 「02 행사 홈 · v2.0 Candidate」 (#467): summary cards, panels and shortcuts on real data. */
describe("event home dashboard", () => {
  async function openHome(status: "DRAFT" | "ACTIVE" | "ENDED") {
    setLifecycle(EVENT, status, 2);
    await login({ userId: localUsers[0].userId });
    render(
      <MemoryRouter initialEntries={[`/events/${EVENT}`]}>
        <App />
      </MemoryRouter>,
    );
    return screen.findByRole("region", { name: "운영 요약" }, WAIT);
  }

  it("keeps every way in from the home of a new event, with nothing awkward at zero", async () => {
    const stats = await openHome("DRAFT");
    expect(await within(stats).findByRole("link", { name: /^참가자.*신청 집계.*0명/ }, WAIT)).toHaveAttribute(
      "href",
      `/events/${EVENT}/participants/summary`,
    );
    expect(within(stats).getByRole("link", { name: /^준비 업무/ })).toHaveAttribute("href", `/events/${EVENT}/tasks`);
    expect(within(stats).getByRole("link", { name: /^일정/ })).toHaveAttribute("href", `/events/${EVENT}/schedule`);
    expect(within(stats).getByRole("link", { name: /^변경 요청/ })).toHaveAttribute("href", `/events/${EVENT}/notifications`);
    // The mock seeds one open task (안내문 출력); it opens its own detail.
    const now = screen.getByRole("region", { name: "지금 할 일" });
    expect(await within(now).findByRole("link", { name: /안내문 출력.*담당 미정.*할 일/ }, WAIT)).toHaveAttribute(
      "href",
      expect.stringMatching(new RegExp(`^/events/${EVENT}/tasks/`)),
    );
    expect(await screen.findByText("아직 일정이 없어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText("필요한 업무부터 시작해 보세요.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다른 기능 시작" })).not.toBeInTheDocument();

    const shortcuts = screen.getByRole("navigation", { name: "바로가기" });
    expect(within(shortcuts).getByRole("link", { name: /^참가 현황/ })).toHaveAttribute("href", `/events/${EVENT}/participants`);
    expect(within(shortcuts).getByRole("link", { name: /^준비 업무/ })).toHaveAttribute("href", `/events/${EVENT}/tasks`);
    expect(within(shortcuts).getByRole("link", { name: /^일정/ })).toHaveAttribute("href", `/events/${EVENT}/schedule`);
    expect(screen.getByRole("link", { name: "모두 보기" })).toHaveAttribute("href", `/events/${EVENT}/notices`);
  });

  it("drops 지금 할 일 and 다가오는 일정 on an ended event and keeps 회고", async () => {
    await openHome("ENDED");
    expect(screen.getByRole("heading", { name: "행사가 종료됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "회고" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "지금 할 일" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "다가오는 일정" })).not.toBeInTheDocument();
  });
});
