import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import {
  checkIn as operatorCheckIn,
  checkInCodeFor,
  checkInLogsOf,
  seedCheckIn,
  seededParticipants,
  withdrawParticipant,
} from "../mocks/checkInStore";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";
import { server } from "../mocks/server";
import { revokePermissions } from "../mocks/taskStore";
import { CameraError, type CameraFailure } from "./qrCamera";

/** The camera is replaced: tests push decoded values through `read`, as the decoder would. */
const camera = vi.hoisted(() => ({
  read: (() => {}) as (code: string) => void,
  failure: null as string | null,
  started: 0,
  stopped: 0,
}));

vi.mock("./qrCamera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./qrCamera")>();
  return {
    ...actual,
    startQrCamera: async (_video: HTMLVideoElement, onCode: (code: string) => void, signal?: AbortSignal) => {
      camera.started += 1;
      if (camera.failure) throw new actual.CameraError(camera.failure as CameraFailure);
      camera.read = onCode;
      let open = true;
      const stop = () => {
        if (open) camera.stopped += 1;
        open = false;
      };
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) stop();
      return { stop };
    },
  };
});

const EVENT = localEvent.eventId;
const WAIT = { timeout: 4000 };

function participant(name: string) {
  return seededParticipants().find((item) => item.name === name)!;
}

function codeOf(name: string): string {
  return checkInCodeFor(EVENT, participant(name).participantId);
}

function postKeys(): string[] {
  const keys: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/check-ins")) {
      keys.push(request.headers.get("Idempotency-Key") ?? "");
    }
  });
  return keys;
}

async function openField(userIndex = 2, status: "DRAFT" | "ACTIVE" | "ENDED" = "ACTIVE") {
  setLifecycle(EVENT, status, 2);
  await login({ userId: localUsers[userIndex].userId });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/field`]}>
      <App />
    </MemoryRouter>,
  );
}

async function openScanner() {
  const button = await screen.findByRole("button", { name: "QR 스캔" }, WAIT);
  await waitFor(() => expect(button).toBeEnabled(), WAIT);
  fireEvent.click(button);
  await screen.findByRole("region", { name: "QR 스캔" }, WAIT);
  await screen.findByText("참가자의 체크인 QR을 네모 안에 맞춰 주세요.", {}, WAIT);
}

function read(code: string) {
  act(() => camera.read(code));
}

function scanRegion() {
  return screen.getByRole("region", { name: "QR 스캔" });
}

beforeEach(() => {
  camera.failure = null;
  camera.started = 0;
  camera.stopped = 0;
  camera.read = () => {};
});

afterEach(() => {
  server.events.removeAllListeners();
});

describe("field QR scan", () => {
  it("shows the name alone when the participant has no 또래", async () => {
    await openField();
    await openScanner();
    read(codeOf("정민호"));
    await within(scanRegion()).findByText("체크인됨", {}, WAIT);
    expect(within(scanRegion()).getByText("정민호")).toHaveClass("event-field__scan-name");
  });

  it("checks in by QR with a fresh key and shows 또래 and name large as one line", async () => {
    const keys = postKeys();
    await openField();
    await openScanner();

    read(codeOf("김하늘"));
    await within(scanRegion()).findByText("체크인됨", {}, WAIT);
    const result = within(scanRegion()).getByRole("status");
    expect(within(scanRegion()).getByText("94 김하늘")).toHaveClass("event-field__scan-name");
    expect(within(scanRegion()).queryByText(/^또래 \d+$/)).not.toBeInTheDocument();
    expect(result).toHaveTextContent("체크인됨");
    await waitFor(() => expect(screen.getByRole("button", { name: "다음 스캔" })).toHaveFocus(), WAIT);

    fireEvent.click(screen.getByRole("button", { name: "다음 스캔" }));
    read(codeOf("박서준"));
    await within(scanRegion()).findByText("96 박서준", {}, WAIT);

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe("");
    expect(keys[0]).not.toBe(keys[1]);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "도착 2명" })).toBeInTheDocument();
    }, WAIT);
  });

  it("sends one request for a QR read many times in a row", async () => {
    const keys = postKeys();
    await openField();
    await openScanner();

    const code = codeOf("김하람");
    read(code);
    read(code);
    read(code);
    await within(scanRegion()).findByText("체크인됨", {}, WAIT);
    read(code);
    read(codeOf("박서준"));
    expect(keys).toHaveLength(1);

    // Right after 다음 스캔 the same QR is still in front of the camera: ignored.
    fireEvent.click(screen.getByRole("button", { name: "다음 스캔" }));
    read(code);
    expect(screen.queryByText("체크인됨")).not.toBeInTheDocument();
    expect(keys).toHaveLength(1);

    read(codeOf("박서준"));
    await within(scanRegion()).findByText("96 박서준", {}, WAIT);
    expect(keys).toHaveLength(2);
  });

  it("shows ALREADY_CHECKED_IN with the first check-in", async () => {
    seedCheckIn(EVENT, participant("이수아").participantId);
    await openField();
    await openScanner();
    read(codeOf("이수아"));
    await within(scanRegion()).findByText("이미 체크인됨", {}, WAIT);
    expect(within(scanRegion()).getByText("94 이수아")).toBeInTheDocument();
    expect(within(scanRegion()).getByText(/처음 체크인 .* · Local staff/)).toBeInTheDocument();
  });

  it("does not send a value without the SCENE prefix", async () => {
    const keys = postKeys();
    await openField();
    await openScanner();
    read("https://example.com/ticket/123");
    expect(await within(scanRegion()).findByRole("alert", {}, WAIT)).toHaveTextContent("SCENE 체크인 QR이 아니에요");
    expect(keys).toHaveLength(0);
  });

  it("says a QR of another event is not for this event", async () => {
    await openField();
    await openScanner();
    read(checkInCodeFor("00000000-0000-4000-8000-000000000099", participant("김하늘").participantId));
    expect(await within(scanRegion()).findByRole("alert", {}, WAIT)).toHaveTextContent("이 행사의 QR이 아니에요");
    expect(screen.queryByText("94 김하늘", { selector: ".event-field__scan-name" })).not.toBeInTheDocument();
  });

  it("says the application was withdrawn", async () => {
    await openField();
    await openScanner();
    withdrawParticipant(EVENT, participant("정민호").participantId);
    read(codeOf("정민호"));
    expect(await within(scanRegion()).findByRole("alert", {}, WAIT)).toHaveTextContent("신청이 철회됐어요");
  });

  it("resends the same QR with the same key after 확인 안 됨 and checks in once (#287)", async () => {
    const keys = postKeys();
    server.use(http.post("/api/v1/operator/events/:eventId/check-ins", () => HttpResponse.json({}, { status: 500 })));
    await openField();
    await openScanner();
    read(codeOf("한지우"));
    const unknown = await within(scanRegion()).findByRole("alert", {}, WAIT);
    expect(unknown).toHaveTextContent("확인 안 됨");
    expect(within(scanRegion()).queryByText("체크인됨")).not.toBeInTheDocument();
    expect(keys).toHaveLength(4);
    expect(await screen.findByText("QR 스캔 체크인")).toBeInTheDocument();

    server.use(http.post("/api/v1/operator/events/:eventId/check-ins", () => HttpResponse.error()));
    fireEvent.click(screen.getByRole("button", { name: "다음 스캔" }));
    read(codeOf("한지우"));
    expect(await within(scanRegion()).findByRole("alert", {}, WAIT)).toHaveTextContent("확인 안 됨");

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "다음 스캔" }));
    read(codeOf("한지우"));
    await within(scanRegion()).findByText("체크인됨", {}, WAIT);
    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(1);
    expect(checkInLogsOf(EVENT)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText("QR 스캔 체크인")).not.toBeInTheDocument(), WAIT);
  });

  it("checks in once when the scan answer was lost (#287)", async () => {
    const keys = postKeys();
    server.use(
      http.post(
        "/api/v1/operator/events/:eventId/check-ins",
        async ({ request }) => {
          operatorCheckIn(EVENT, localUsers[2].userId, request.headers.get("Idempotency-Key"), await request.json());
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    await openField();
    await openScanner();
    read(codeOf("김하람"));
    await within(scanRegion()).findByText("체크인됨", {}, WAIT);
    expect(within(scanRegion()).getByText("95 김하람")).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(checkInLogsOf(EVENT)).toHaveLength(1);
  });

  it("closes the scanner and says why when the event ended meanwhile", async () => {
    await openField();
    await openScanner();
    setLifecycle(EVENT, "ENDED", 3);
    read(codeOf("김하늘"));
    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent("종료된 행사라 체크인과 취소를 할 수 없어요.");
    await waitFor(() => expect(screen.queryByRole("region", { name: "QR 스캔" })).not.toBeInTheDocument(), WAIT);
    expect(camera.stopped).toBe(camera.started);
  });

  it.each([
    ["denied", "카메라 권한이 거부됐어요", true],
    ["no-camera", "사용할 수 있는 카메라가 없어요", false],
    ["insecure", "HTTPS 주소에서만 카메라를 쓸 수 있어요", false],
  ] as const)("explains a %s camera and points to search", async (failure, copy, retry) => {
    camera.failure = failure;
    await openField();
    const button = await screen.findByRole("button", { name: "QR 스캔" }, WAIT);
    await waitFor(() => expect(button).toBeEnabled(), WAIT);
    fireEvent.click(button);
    const alert = await within(await screen.findByRole("region", { name: "QR 스캔" }, WAIT)).findByRole("alert", {}, WAIT);
    expect(alert).toHaveTextContent(copy);
    expect(alert).toHaveTextContent("이름이나 전화 끝 4자리로 찾아 체크인할 수 있어요.");
    expect(within(alert).queryByRole("button", { name: "다시 시도" }) !== null).toBe(retry);

    fireEvent.click(within(alert).getByRole("button", { name: "이름으로 찾기" }));
    expect(screen.queryByRole("region", { name: "QR 스캔" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("이름 또는 전화 끝 4자리")).toHaveFocus();
  });

  it("stops the camera when the scanner closes or the page is left", async () => {
    await openField();
    await openScanner();
    fireEvent.click(screen.getByRole("button", { name: "스캔 닫기" }));
    expect(screen.queryByRole("region", { name: "QR 스캔" })).not.toBeInTheDocument();
    expect(camera.stopped).toBe(camera.started);

    await openScanner();
    expect(camera.stopped).toBeLessThan(camera.started);
    fireEvent.click(screen.getByRole("link", { name: "행사 홈" }));
    await screen.findByRole("button", { name: "행사 설정" }, WAIT);
    expect(camera.stopped).toBe(camera.started);
  });

  it("blocks the scan without CHECKIN_WRITE", async () => {
    revokePermissions(EVENT, localUsers[2].userId, ["CHECKIN_WRITE"]);
    await openField();
    expect(await screen.findByRole("note", {}, WAIT)).toHaveTextContent("체크인 권한이 없어 명단만 볼 수 있어요.");
    const button = screen.getByRole("button", { name: "QR 스캔" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/체크인 권한이 없어/);
  });

  it("blocks the scan before the event starts", async () => {
    await openField(0, "DRAFT");
    expect(await screen.findByRole("note", {}, WAIT)).toHaveTextContent("행사를 시작하면 체크인할 수 있어요.");
    expect(screen.getByRole("button", { name: "QR 스캔" })).toBeDisabled();
  });
});

describe("CameraError", () => {
  it("keeps the reason", () => {
    expect(new CameraError("denied").reason).toBe("denied");
  });
});
