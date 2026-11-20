import { act, render, screen } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { login } from "../../api/session";
import { localEvent, localUsers } from "../../mocks/fixtures/seed";
import { createOperatorNotice } from "../../mocks/noticeStore";
import { setLifecycle } from "../../mocks/operatorStore";

const EVENT = localEvent.eventId;
const WAIT = { timeout: 4000 };

// React Query's own refetch on focus/visibility is off in this file, so only the operator `updates`
// check (useOperatorUpdatesPolling) can reload the notice reads.
focusManager.setEventListener(() => () => undefined);

describe("operator notices and updates (D3 with I3)", () => {
  it("reads the list again when another operator's notice raises updates.notices", async () => {
    setLifecycle(EVENT, "ACTIVE", 4);
    await login({ userId: localUsers[0].userId });
    render(
      <MemoryRouter initialEntries={[`/events/${EVENT}/notices`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("발행한 공지가 없어요.", {}, WAIT)).toBeInTheDocument();
    createOperatorNotice(EVENT, localUsers[1].userId, {
      title: "다른 운영자가 쓴 공지",
      body: "본문",
      audience: [{ type: "ALL" }],
      publish: true,
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(await screen.findByText("다른 운영자가 쓴 공지", {}, WAIT)).toBeInTheDocument();
  });
});
