import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { seedCheckIn, seededParticipants, withdrawParticipant } from "../mocks/checkInStore";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";
import { server } from "../mocks/server";
import { revokePermissions } from "../mocks/taskStore";

const EVENT = localEvent.eventId;
const SEARCH = "이름 또는 전화 끝 4자리";
const WAIT = { timeout: 4000 };

function participant(name: string) {
  return seededParticipants().find((item) => item.name === name)!;
}

async function openAs(userIndex: number, status: "DRAFT" | "ACTIVE" | "ENDED" | "ARCHIVED" = "ACTIVE") {
  setLifecycle(EVENT, status, 2);
  await login({ userId: localUsers[userIndex].userId });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/field`]}>
      <App />
    </MemoryRouter>,
  );
}

function summaryValue(label: string): string {
  const region = screen.getByRole("region", { name: "체크인 현황" });
  const item = within(region).getByText(label).closest("p")!;
  return item.querySelector("strong")!.textContent ?? "";
}

async function rosterRow(name: string): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    const list = screen.getByRole("list", { name: "체크인 명단" });
    found = within(list)
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText(name, { selector: ".event-field__name" }));
    expect(found).toBeDefined();
  }, WAIT);
  return found!;
}

async function search(value: string) {
  fireEvent.change(await screen.findByLabelText(SEARCH, {}, WAIT), { target: { value } });
}

describe("field check-in", () => {
  it("shows the summary and filters the roster by check-in state", async () => {
    seedCheckIn(EVENT, participant("박서준").participantId);
    await openAs(2);

    const region = await screen.findByRole("region", { name: "체크인 현황" }, WAIT);
    await within(region).findByText("전체", {}, WAIT);
    expect(summaryValue("체크인 완료")).toBe("1");
    expect(summaryValue("미완료")).toBe("7");
    expect(summaryValue("전체")).toBe("8");
    expect(await screen.findByText("8명", {}, WAIT)).toBeInTheDocument();

    const done = await rosterRow("96 박서준");
    expect(within(done).getByText(/Local staff · QR/)).toBeInTheDocument();
    expect(within(done).getByRole("button", { name: "96 박서준 체크인 취소" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(await screen.findByText("1명", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "완료" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "미완료" }));
    expect(await screen.findByText("7명", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText("96 박서준")).not.toBeInTheDocument();
  });

  it("finds by name or phone last 4 and shows last 4 to tell same names apart", async () => {
    await openAs(2);
    await screen.findByText("8명", {}, WAIT);

    await search("이수아");
    expect(await screen.findByText("2명", {}, WAIT)).toBeInTheDocument();
    // 또래 leads the title ("94 이수아"), so the line below keeps only phone last 4.
    expect(screen.getByText("94 이수아", { selector: ".event-field__name" })).toBeInTheDocument();
    expect(screen.getByText("97 이수아", { selector: ".event-field__name" })).toBeInTheDocument();
    expect(screen.getByText("끝자리 1357")).toBeInTheDocument();
    expect(screen.getByText("끝자리 8642")).toBeInTheDocument();
    expect(screen.queryByText(/94 · 끝자리/)).not.toBeInTheDocument();

    await search("1234");
    expect(await screen.findByText("94 김하늘", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("2명")).toBeInTheDocument();
    expect(screen.getByText("98 최예린")).toBeInTheDocument();

    await search("없는사람");
    expect(await screen.findByText("'없는사람'에 맞는 참가자가 없어요.", {}, WAIT)).toBeInTheDocument();
  });

  it("checks a participant in with a fresh Idempotency-Key and updates the summary", async () => {
    const keys: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/check-ins")) {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
      }
    });
    await openAs(2);
    await search("김하늘");
    const row = await rosterRow("94 김하늘");
    fireEvent.click(within(row).getByRole("button", { name: "94 김하늘 체크인" }));

    expect(await screen.findByRole("status", {}, WAIT)).toHaveTextContent("94 김하늘 님을 체크인했어요.");
    expect(await screen.findByRole("button", { name: "94 김하늘 체크인 취소" }, WAIT)).toBeInTheDocument();
    await screen.findByText("1", { selector: "strong" }, WAIT);
    expect(summaryValue("체크인 완료")).toBe("1");

    await search("김하람");
    const next = await rosterRow("95 김하람");
    fireEvent.click(within(next).getByRole("button", { name: "95 김하람 체크인" }));
    expect(await screen.findByText("95 김하람 님을 체크인했어요.", {}, WAIT)).toBeInTheDocument();

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe("");
    expect(keys[0]).not.toBe(keys[1]);
    server.events.removeAllListeners();
  });

  it("shows ALREADY_CHECKED_IN as a notice with time and who checked in", async () => {
    await openAs(2);
    await search("김하늘");
    const row = await rosterRow("94 김하늘");
    // Another operator checks the same person in after this roster loaded.
    seedCheckIn(EVENT, participant("김하늘").participantId, "2027-01-15T01:42:00Z");
    fireEvent.click(within(row).getByRole("button", { name: "94 김하늘 체크인" }));

    const notice = await screen.findByRole("status", {}, WAIT);
    expect(notice).toHaveTextContent("94 김하늘 님은 이미 체크인했어요");
    expect(notice).toHaveTextContent("Local staff");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels after one confirmation and treats ALREADY_CANCELLED as a notice", async () => {
    let reason: unknown;
    server.events.on("request:start", async ({ request }) => {
      if (request.url.endsWith("/cancel")) reason = ((await request.clone().json()) as { reason?: string }).reason;
    });
    seedCheckIn(EVENT, participant("한지우").participantId);
    await openAs(2);
    await search("한지우");
    const row = await rosterRow("95 한지우");
    fireEvent.click(within(row).getByRole("button", { name: "95 한지우 체크인 취소" }));

    const dialog = await screen.findByRole("dialog", { name: "95 한지우 님의 체크인을 취소할까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "95 한지우 체크인 취소" }));
    const again = await screen.findByRole("dialog");
    fireEvent.change(within(again).getByLabelText("취소 사유 (선택)"), { target: { value: "다른 사람 QR" } });
    fireEvent.click(within(again).getByRole("button", { name: "취소하기" }));

    expect(await screen.findByText("95 한지우 님의 체크인을 취소했어요.", {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "95 한지우 체크인" }, WAIT)).toBeInTheDocument();
    expect(reason).toBe("다른 사람 QR");
    server.events.removeAllListeners();

    server.use(
      http.post("/api/v1/operator/events/:eventId/check-ins/:checkInId/cancel", () =>
        HttpResponse.json({
          result: "ALREADY_CANCELLED",
          checkIn: {
            checkInId: "c1",
            participantId: participant("박서준").participantId,
            status: "CANCELLED",
            method: "MANUAL",
            checkedInAt: "2027-01-15T01:00:00Z",
          },
        }),
      ),
    );
    seedCheckIn(EVENT, participant("박서준").participantId);
    await search("박서준");
    fireEvent.click(await screen.findByRole("button", { name: "96 박서준 체크인 취소" }, WAIT));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소하기" }));
    expect(await screen.findByText("96 박서준 님의 체크인은 이미 취소돼 있어요.", {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is read only without CHECKIN_WRITE and hides phone last 4", async () => {
    revokePermissions(EVENT, localUsers[2].userId, ["CHECKIN_WRITE"]);
    await openAs(2);
    const row = await rosterRow("94 김하늘");
    expect(await screen.findByRole("note", {}, WAIT)).toHaveTextContent("체크인 권한이 없어 명단만 볼 수 있어요.");
    expect(within(row).getByRole("button", { name: "94 김하늘 체크인" })).toBeDisabled();
    expect(screen.queryByText(/끝자리/)).not.toBeInTheDocument();

    await search("1234");
    expect(await screen.findByText("'1234'에 맞는 참가자가 없어요.", {}, WAIT)).toBeInTheDocument();
  });

  it.each([
    ["ENDED", "종료된 행사라 체크인과 취소를 할 수 없어요."],
    ["ARCHIVED", "보관된 행사라 체크인과 취소를 할 수 없어요."],
    ["DRAFT", "행사를 시작하면 체크인할 수 있어요."],
  ] as const)("blocks check-in on a %s event and says why", async (status, copy) => {
    seedCheckIn(EVENT, participant("박서준").participantId);
    await openAs(0, status);
    const row = await rosterRow("94 김하늘");
    expect(await screen.findByRole("note", {}, WAIT)).toHaveTextContent(copy);
    expect(within(row).getByRole("button", { name: "94 김하늘 체크인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "96 박서준 체크인 취소" })).toBeDisabled();
    expect(summaryValue("체크인 완료")).toBe("1");
  });

  it("says the event ended when the server refuses a check-in", async () => {
    await openAs(2);
    const row = await rosterRow("94 김하늘");
    setLifecycle(EVENT, "ENDED", 3);
    fireEvent.click(within(row).getByRole("button", { name: "94 김하늘 체크인" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent("종료된 행사라 체크인과 취소를 할 수 없어요.");
    expect(await screen.findByRole("note", {}, WAIT)).toBeInTheDocument();
  });

  it("explains a withdrawn application", async () => {
    await openAs(2);
    const row = await rosterRow("정민호");
    withdrawParticipant(EVENT, participant("정민호").participantId);
    fireEvent.click(within(row).getByRole("button", { name: "정민호 체크인" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent("정민호 님은 신청을 철회해서 체크인할 수 없어요.");
  });
});
