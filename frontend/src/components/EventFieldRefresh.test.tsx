import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { seedCheckIn, seededParticipants } from "../mocks/checkInStore";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";
import { fieldRefresh } from "./fieldRefresh";

const EVENT = localEvent.eventId;
const WAIT = { timeout: 4000 };
const original = { ...fieldRefresh };

function participant(name: string) {
  return seededParticipants().find((item) => item.name === name)!;
}

async function open() {
  setLifecycle(EVENT, "ACTIVE", 2);
  await login({ userId: localUsers[2].userId });
  render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/field`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("list", { name: "체크인 명단" }, WAIT);
}

/** The 체크인 현황 count on a filter chip ("전체", "미도착", "도착 예정", "도착"), as the chip's name says it. */
function summaryValue(label: string): string {
  const filters = screen.getByRole("group", { name: "체크인 상태로 보기" });
  const chip = within(filters).getByRole("button", { name: new RegExp(`^${label} [\\d,]+명$`) });
  return chip.getAttribute("aria-label")!.slice(label.length + 1, -1);
}

function rowBadge(name: string): string | null {
  const list = screen.getByRole("list", { name: "체크인 명단" });
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name, { selector: ".event-field__name" }));
  return row?.querySelector(".event-field__badge")?.textContent ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Real timers with a short interval: the page reads what another desk wrote without any action here.
describe("field refresh on the page (#408)", () => {
  beforeEach(() => {
    fieldRefresh.intervalMs = 300;
    fieldRefresh.quietMs = 0;
  });
  afterEach(() => {
    Object.assign(fieldRefresh, original);
  });

  it("shows another desk's check-in without a reload and says when it read", async () => {
    await open();
    expect(screen.getByText(/에 읽음$/)).toBeInTheDocument();
    expect(rowBadge("94 김하늘")).toBe("미도착");

    // Another desk checks 김하늘 in on the server.
    seedCheckIn(EVENT, participant("김하늘").participantId);
    await waitFor(() => expect(summaryValue("도착")).toBe("1"), WAIT);
    await waitFor(() => expect(rowBadge("94 김하늘")).toBe("도착"), WAIT);
  });

  it("keeps the roster still while the search box is focused, and reads it when focus leaves", async () => {
    await open();
    const input = screen.getByLabelText("이름 또는 전화 끝 4자리");
    fireEvent.focus(input);
    seedCheckIn(EVENT, participant("김하늘").participantId);
    await waitFor(() => expect(summaryValue("도착")).toBe("1"), WAIT);
    await sleep(fieldRefresh.intervalMs * 2);
    expect(rowBadge("94 김하늘")).toBe("미도착");

    fireEvent.blur(input);
    await waitFor(() => expect(rowBadge("94 김하늘")).toBe("도착"), WAIT);
  });

  it("keeps the roster still behind the cancel dialog", async () => {
    seedCheckIn(EVENT, participant("박서준").participantId);
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "96 박서준 체크인 취소" }, WAIT));
    expect(await screen.findByRole("dialog", {}, WAIT)).toBeInTheDocument();

    seedCheckIn(EVENT, participant("김하늘").participantId);
    await waitFor(() => expect(summaryValue("도착")).toBe("2"), WAIT);
    await sleep(fieldRefresh.intervalMs * 2);
    expect(rowBadge("94 김하늘")).toBe("미도착");

    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(rowBadge("94 김하늘")).toBe("도착"), WAIT);
  });

  it("새로 고침 reads at once", async () => {
    fieldRefresh.intervalMs = 60_000;
    await open();
    seedCheckIn(EVENT, participant("김하늘").participantId);
    fireEvent.click(screen.getByRole("button", { name: "새로 고침" }));
    await waitFor(() => expect(rowBadge("94 김하늘")).toBe("도착"), WAIT);
    expect(summaryValue("도착")).toBe("1");
  });
});
