import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { checkIn as operatorCheckIn, seedCheckIn, seededParticipants } from "../mocks/checkInStore";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";
import { readParticipantCheckIn, setParticipantCheckInSecret } from "../mocks/participantCheckInStore";
import { server } from "../mocks/server";
import { qrPath } from "./qrPath";

const EVENT = localEvent.eventId;
const CODE = "SCENE-CI1.AAAAAAAAQACAAAAAAAADAJmZmZmZmZmZmZmZmZmZmZk";
const SECRET = "hidden-server-detail";

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: "urn:scene:problem:test", title: code, status, detail: SECRET, code },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function signedIn() {
  return http.get("/api/v1/participant/me", () =>
    HttpResponse.json({ participantId: "person-1", eventId: EVENT, spaceId: "space-1", name: "김" }),
  );
}

function checkIn(body: Record<string, unknown>) {
  return http.get("/api/v1/participant/check-in", () =>
    HttpResponse.json({ status: "AVAILABLE", code: null, checkedIn: false, checkedInAt: null, ...body }),
  );
}

function openApp() {
  return render(
    <MemoryRouter initialEntries={[`/participate/${EVENT}`]}>
      <App />
    </MemoryRouter>,
  );
}

function qrRegion() {
  return screen.getByRole("region", { name: "도착 확인" });
}

describe("participant arrival QR", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the QR in black on white and keeps the value out of web storage", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    server.use(signedIn(), checkIn({ code: CODE }));
    openApp();
    const image = await screen.findByRole("img", { name: "도착 QR" });
    const path = image.querySelector("path")!;
    expect(path.getAttribute("d")).toBe(qrPath(CODE).d);
    expect(path.getAttribute("fill")).toBe("#000000");
    expect(image.querySelector("rect")!.getAttribute("fill")).toBe("#ffffff");
    expect(screen.getByText(/접수처에 이 QR을 보여 주세요/)).toBeInTheDocument();
    expect(screen.queryByText(CODE)).not.toBeInTheDocument();
    expect(screen.queryByText("도착 확인됨")).not.toBeInTheDocument();
    expect(local.mock.calls.flat().some((value) => String(value).includes(CODE))).toBe(false);
  });

  it.each([
    ["NOT_STARTED", "행사가 시작되면 열립니다."],
    ["ENDED", "행사가 끝났습니다."],
    ["NOT_ELIGIBLE", "신청이 취소되어 도착 QR이 없어요. 접수처에 이름을 말해 주세요."],
  ])("explains %s without a QR", async (status, text) => {
    server.use(signedIn(), checkIn({ status }));
    openApp();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "도착 QR" })).not.toBeInTheDocument();
  });

  it("explains a server without a QR secret", async () => {
    server.use(signedIn(), http.get("/api/v1/participant/check-in", () => problem(404, "RESOURCE_NOT_FOUND")));
    openApp();
    expect(await screen.findByText("도착 QR이 아직 준비되지 않았어요. 접수처에 이름을 말해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "도착 QR" })).not.toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("shows the arrival time once checked in", async () => {
    server.use(signedIn(), checkIn({ code: CODE, checkedIn: true, checkedInAt: "2027-01-15T01:42:00Z" }));
    openApp();
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("도착 확인됨 · 2027. 1. 15. 10:42");
  });

  it("shows arrival on an ended event too", async () => {
    server.use(signedIn(), checkIn({ status: "ENDED", checkedIn: true, checkedInAt: "2027-01-15T01:42:00Z" }));
    openApp();
    expect(await screen.findByText("행사가 끝났습니다.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("도착 확인됨");
  });

  it("picks up a check-in made while the screen was open", async () => {
    let checked = false;
    server.use(
      signedIn(),
      http.get("/api/v1/participant/check-in", () =>
        HttpResponse.json({
          status: "AVAILABLE",
          code: CODE,
          checkedIn: checked,
          checkedInAt: checked ? "2027-01-15T01:42:00Z" : null,
        }),
      ),
    );
    openApp();
    await screen.findByRole("img", { name: "도착 QR" });
    expect(screen.queryByText("도착 확인됨")).not.toBeInTheDocument();
    checked = true;
    fireEvent.click(within(qrRegion()).getByRole("button", { name: "새로 고침" }));
    expect(await screen.findByText("도착 확인됨")).toBeInTheDocument();
  });

  it("lets the participant retry a failed load", async () => {
    let fail = true;
    server.use(
      signedIn(),
      http.get("/api/v1/participant/check-in", () =>
        fail ? HttpResponse.error() : HttpResponse.json({ status: "AVAILABLE", code: CODE, checkedIn: false, checkedInAt: null }),
      ),
    );
    openApp();
    expect(await screen.findByText("도착 QR을 불러오지 못했어요.", {}, { timeout: 3000 })).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(qrRegion()).getByRole("button", { name: "새로 고침" }));
    expect(await screen.findByRole("img", { name: "도착 QR" })).toBeInTheDocument();
  });

  it("keeps the QR on screen when a reload fails", async () => {
    let fail = false;
    server.use(
      signedIn(),
      http.get("/api/v1/participant/check-in", () =>
        fail ? HttpResponse.error() : HttpResponse.json({ status: "AVAILABLE", code: CODE, checkedIn: false, checkedInAt: null }),
      ),
    );
    openApp();
    await screen.findByRole("img", { name: "도착 QR" });
    fail = true;
    fireEvent.click(within(qrRegion()).getByRole("button", { name: "새로 고침" }));
    expect(await screen.findByText(/최신 상태를 불러오지 못했어요/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "도착 QR" })).toBeInTheDocument();
  });
});

describe("participant check-in mock", () => {
  const participant = seededParticipants()[0].participantId;

  it("follows the event state and signs a SCENE-CI1. value", async () => {
    expect(await readParticipantCheckIn(EVENT, participant)).toMatchObject({ status: "NOT_STARTED", code: null });
    setLifecycle(EVENT, "ACTIVE", 2);
    const active = await readParticipantCheckIn(EVENT, participant);
    expect(active).toMatchObject({ status: "AVAILABLE", checkedIn: false, checkedInAt: null });
    const code = "code" in active ? active.code! : "";
    expect(code).toMatch(/^SCENE-CI1\.[A-Za-z0-9_-]{43}$/);
    expect(await readParticipantCheckIn(EVENT, participant)).toMatchObject({ code });
    seedCheckIn(EVENT, participant);
    expect(await readParticipantCheckIn(EVENT, participant)).toMatchObject({
      checkedIn: true,
      checkedInAt: "2027-01-15T01:42:00Z",
    });
    setLifecycle(EVENT, "ENDED", 3);
    expect(await readParticipantCheckIn(EVENT, participant)).toMatchObject({ status: "ENDED", code: null, checkedIn: true });
  });

  it("shows a value the operator mock scan accepts", async () => {
    setLifecycle(EVENT, "ACTIVE", 2);
    const shown = await readParticipantCheckIn(EVENT, participant);
    const code = "code" in shown ? shown.code! : "";
    const scanned = operatorCheckIn(EVENT, localUsers[0].userId, "scan-1", { mode: "QR", code });
    expect(scanned).toMatchObject({ result: "CHECKED_IN", participant: { participantId: participant } });
    expect(await readParticipantCheckIn(EVENT, participant)).toMatchObject({ checkedIn: true });
  });

  it("is a 404 without a secret and NOT_ELIGIBLE off the roster", async () => {
    setLifecycle(EVENT, "ACTIVE", 2);
    expect(await readParticipantCheckIn(EVENT, "00000000-0000-4000-8000-0000000009ff")).toMatchObject({
      status: "NOT_ELIGIBLE",
      code: null,
    });
    setParticipantCheckInSecret(null);
    expect(await readParticipantCheckIn(EVENT, participant)).toEqual({
      failure: { status: 404, code: "RESOURCE_NOT_FOUND" },
    });
  });
});
