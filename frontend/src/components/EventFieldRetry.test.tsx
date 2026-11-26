import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { checkIn, checkInLogsOf, seedCheckIn, seededParticipants } from "../mocks/checkInStore";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";
import { server } from "../mocks/server";

/** 현장 운영 over a weak connection (#287): same Idempotency-Key on resend, "확인 안 됨", offline. */
const EVENT = localEvent.eventId;
const STAFF = localUsers[2].userId;
const CHECK_INS = "/api/v1/operator/events/:eventId/check-ins";
const CANCEL = "/api/v1/operator/events/:eventId/check-ins/:checkInId/cancel";
const WAIT = { timeout: 4000 };

function participant(name: string) {
  return seededParticipants().find((item) => item.name === name)!;
}

function postKeys(path: "/check-ins" | "/cancel" = "/check-ins"): string[] {
  const keys: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && request.url.endsWith(path)) keys.push(request.headers.get("Idempotency-Key") ?? "");
  });
  return keys;
}

async function openField() {
  setLifecycle(EVENT, "ACTIVE", 2);
  await login({ userId: STAFF });
  render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/field`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("list", { name: "체크인 명단" }, WAIT);
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

/** The 체크인 현황 count on a filter chip ("전체", "미도착", "도착 예정", "도착"), as the chip's name says it. */
function summaryValue(label: string): string {
  const filters = screen.getByRole("group", { name: "체크인 상태로 보기" });
  const chip = within(filters).getByRole("button", { name: new RegExp(`^${label} [\\d,]+명$`) });
  return chip.getAttribute("aria-label")!.slice(label.length + 1, -1);
}

function pendingRegion() {
  return screen.queryByRole("region", { name: /확인 안 된 요청/ });
}

let onLine = true;
function setOnline(next: boolean) {
  onLine = next;
  act(() => {
    window.dispatchEvent(new Event(next ? "online" : "offline"));
  });
}

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  onLine = true;
});

describe("field check-in retry", () => {
  it("resends a failed check-in with the same key and checks in once", async () => {
    const keys = postKeys();
    server.use(http.post(CHECK_INS, () => HttpResponse.error(), { once: true }));
    server.use(http.post(CHECK_INS, () => HttpResponse.json({}, { status: 503 }), { once: true }));
    await openField();
    fireEvent.click(within(await rosterRow("94 김하늘")).getByRole("button", { name: "94 김하늘 체크인" }));

    expect(await screen.findByText("94 김하늘 님을 체크인했어요.", {}, WAIT)).toBeInTheDocument();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    await waitFor(() => expect(summaryValue("도착")).toBe("1"), WAIT);
    expect(checkInLogsOf(EVENT)).toHaveLength(1);
    expect(pendingRegion()).not.toBeInTheDocument();
  });

  it("records one check-in when the server handled it but the answer was lost", async () => {
    const keys = postKeys();
    server.use(
      http.post(
        CHECK_INS,
        async ({ request }) => {
          checkIn(EVENT, STAFF, request.headers.get("Idempotency-Key"), await request.json());
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    await openField();
    fireEvent.click(within(await rosterRow("96 박서준")).getByRole("button", { name: "96 박서준 체크인" }));

    expect(await screen.findByText("96 박서준 님을 체크인했어요.", {}, WAIT)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(checkInLogsOf(EVENT)).toEqual([{ participantId: participant("박서준").participantId, action: "CHECKED_IN" }]);
    await waitFor(() => expect(summaryValue("도착")).toBe("1"), WAIT);
  });

  it("shows 확인 안 됨 after the retry limit and resends the same key on 다시 시도", async () => {
    const keys = postKeys();
    server.use(http.post(CHECK_INS, () => HttpResponse.error()));
    await openField();
    fireEvent.click(within(await rosterRow("95 한지우")).getByRole("button", { name: "95 한지우 체크인" }));

    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent("95 한지우 님 체크인이 처리됐는지 확인하지 못했어요.");
    expect(keys).toHaveLength(4);
    const row = await rosterRow("95 한지우");
    expect(within(row).getByText("확인 안 됨")).toBeInTheDocument();
    expect(within(row).queryByText("도착")).not.toBeInTheDocument();
    const pending = pendingRegion()!;
    expect(pending).toHaveTextContent("확인 안 된 요청 1건");
    expect(pending).toHaveTextContent("이 화면을 닫거나 새로 고치면 이 목록은 사라져요.");
    expect(within(pending).getByText("95 한지우 님 체크인")).toBeInTheDocument();

    // Pressing 체크인 is gone for this row; 다시 시도 keeps the key.
    server.resetHandlers();
    fireEvent.click(within(row).getByRole("button", { name: "95 한지우 체크인 다시 시도" }));
    expect(await screen.findByText("95 한지우 님을 체크인했어요.", {}, WAIT)).toBeInTheDocument();
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(1);
    await waitFor(() => expect(pendingRegion()).not.toBeInTheDocument(), WAIT);
    expect(await screen.findByRole("button", { name: "95 한지우 체크인 취소" }, WAIT)).toBeInTheDocument();
    expect(checkInLogsOf(EVENT)).toHaveLength(1);
  });

  it("keeps the cancel key across retries", async () => {
    const keys = postKeys("/cancel");
    seedCheckIn(EVENT, participant("이수아").participantId);
    server.use(http.post(CANCEL, () => HttpResponse.error(), { once: true }));
    await openField();
    fireEvent.change(screen.getByLabelText("이름 또는 전화 끝 4자리"), { target: { value: "1357" } });
    fireEvent.click(await screen.findByRole("button", { name: "94 이수아 체크인 취소" }, WAIT));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소하기" }));

    expect(await screen.findByText("94 이수아 님의 체크인을 취소했어요.", {}, WAIT)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(checkInLogsOf(EVENT)).toEqual([{ participantId: participant("이수아").participantId, action: "CANCELLED" }]);
  });

  it("shows offline, holds the request, and sends it and reloads when back online", async () => {
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => onLine);
    const keys = postKeys();
    await openField();
    setOnline(false);
    expect(await screen.findByText(/오프라인이에요. 연결되면 확인 안 된 요청을 다시 보내고/)).toBeInTheDocument();

    fireEvent.click(within(await rosterRow("98 최예린")).getByRole("button", { name: "98 최예린 체크인" }));
    expect(await screen.findByText("오프라인이에요. 연결되면 98 최예린 님 체크인을 다시 보낼게요.", {}, WAIT)).toBeInTheDocument();
    expect(keys).toHaveLength(0);
    expect(within(await rosterRow("98 최예린")).getByText("확인 안 됨")).toBeInTheDocument();
    expect(pendingRegion()).toHaveTextContent("오프라인이라 연결되면 다시 보내요.");
    expect(within(pendingRegion()!).getByRole("button", { name: "98 최예린 님 체크인 다시 시도" })).toBeDisabled();

    // Meanwhile another operator checked someone else in; the reload after reconnecting shows both.
    seedCheckIn(EVENT, participant("김하람").participantId);
    setOnline(true);
    expect(await screen.findByText("98 최예린 님을 체크인했어요.", {}, WAIT)).toBeInTheDocument();
    expect(keys).toHaveLength(1);
    expect(screen.queryByText(/오프라인이에요. 연결되면 확인 안 된/)).not.toBeInTheDocument();
    await waitFor(() => expect(summaryValue("도착")).toBe("2"), WAIT);
    expect(pendingRegion()).not.toBeInTheDocument();
  });

  it("settles as ALREADY_CHECKED_IN when another operator got there during the retry", async () => {
    server.use(
      http.post(
        CHECK_INS,
        () => {
          seedCheckIn(EVENT, participant("정민호").participantId, "2027-01-15T01:42:00Z");
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    await openField();
    fireEvent.click(within(await rosterRow("정민호")).getByRole("button", { name: "정민호 체크인" }));

    const notice = await screen.findByRole("status", {}, WAIT);
    await waitFor(() => expect(notice).toHaveTextContent("정민호 님은 이미 체크인했어요"), WAIT);
    expect(notice).toHaveTextContent("Local staff");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(pendingRegion()).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "정민호 체크인 취소" }, WAIT)).toBeInTheDocument();
  });

  it("judges a 409 CONFLICT once more with a new key", async () => {
    const keys = postKeys();
    server.use(
      http.post(CHECK_INS, () => HttpResponse.json({ code: "CONFLICT", status: 409 }, { status: 409 }), { once: true }),
    );
    await openField();
    fireEvent.click(within(await rosterRow("95 김하람")).getByRole("button", { name: "95 김하람 체크인" }));
    expect(await screen.findByText("95 김하람 님을 체크인했어요.", {}, WAIT)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("stops retrying and says why when the event ends during the retry", async () => {
    const keys = postKeys();
    server.use(
      http.post(
        CHECK_INS,
        () => {
          setLifecycle(EVENT, "ENDED", 3);
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    await openField();
    fireEvent.click(within(await rosterRow("94 김하늘")).getByRole("button", { name: "94 김하늘 체크인" }));

    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent("종료된 행사라 체크인과 취소를 할 수 없어요.");
    expect(keys).toHaveLength(2);
    expect(await screen.findByRole("note", {}, WAIT)).toHaveTextContent("종료된 행사라");
    expect(pendingRegion()).not.toBeInTheDocument();
    expect(checkInLogsOf(EVENT)).toHaveLength(0);
  });

  it("drops what is still unconfirmed once the event has ended", async () => {
    server.use(http.post(CHECK_INS, () => HttpResponse.error()));
    await openField();
    fireEvent.click(within(await rosterRow("95 한지우")).getByRole("button", { name: "95 한지우 체크인" }));
    await screen.findByText("확인 안 된 요청 1건", {}, WAIT);
    fireEvent.click(within(await rosterRow("96 박서준")).getByRole("button", { name: "96 박서준 체크인" }));
    await waitFor(() => expect(screen.getAllByText("응답을 받지 못했어요. 다시 시도해 주세요.")).toHaveLength(2), WAIT);

    server.resetHandlers();
    setLifecycle(EVENT, "ENDED", 3);
    fireEvent.click(within(pendingRegion()!).getByRole("button", { name: "95 한지우 님 체크인 다시 시도" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent("종료된 행사라 체크인과 취소를 할 수 없어요.");
    await waitFor(() => expect(pendingRegion()).not.toBeInTheDocument(), WAIT);
  });

  it("writes nothing about participants to browser storage", async () => {
    server.use(http.post(CHECK_INS, () => HttpResponse.error()));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    // jsdom has no IndexedDB; with one, opening it would be the write to catch.
    const idb = typeof indexedDB === "undefined" ? null : vi.spyOn(indexedDB, "open");
    await openField();
    fireEvent.click(within(await rosterRow("95 한지우")).getByRole("button", { name: "95 한지우 체크인" }));
    await screen.findByText("응답을 받지 못했어요. 다시 시도해 주세요.", {}, WAIT);
    const written = setItem.mock.calls.map((call) => call.join("=")).join("\n");
    expect(written).not.toContain(participant("한지우").participantId);
    expect(written).not.toContain("한지우");
    if (idb) expect(idb).not.toHaveBeenCalled();
  });
});
