import { fireEvent, render, screen } from "@testing-library/react";
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
