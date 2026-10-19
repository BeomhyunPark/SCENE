import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { createQueryClient } from "../api/queryClient";
import type { LeaveEvent, LeavePreview } from "../api/leave";
import { login } from "../api/session";
import { localEvent, localSpace, localUsers } from "../mocks/fixtures/seed";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { SpaceLeave } from "./SpaceLeave";

const SPACE = localSpace.spaceId;
const SECRET = "hidden-server-detail";

function LoginSpot() {
  const location = useLocation();
  return (
    <p>
      로그인 자리 {location.pathname}
      {location.search}
    </p>
  );
}

function renderLeave() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/spaces/${SPACE}/leave`]}>
        <Routes>
          <Route path="/spaces/:spaceId/leave" element={<SpaceLeave />} />
          <Route path="/events" element={<p>행사 목록 화면</p>} />
          <Route path="/find-organization" element={<p>조직 찾기 화면</p>} />
          <Route path="/login" element={<LoginSpot />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function row(eventId: string, extra?: Partial<LeaveEvent>): LeaveEvent {
  return {
    eventId,
    isOwner: false,
    handoverAccepted: false,
    openTasks: 0,
    ...extra,
  };
}

function previewBody(events: LeaveEvent[], extra?: Partial<LeavePreview>): LeavePreview {
  return {
    leaveBlocked: false,
    blockReason: null,
    events,
    ...extra,
  };
}

function stubPreview(body: LeavePreview, onPreview?: () => void) {
  server.use(
    http.get("/api/v1/operator/spaces/:spaceId/me/leave-preview", () => {
      onPreview?.();
      return HttpResponse.json(body);
    }),
    http.get("/api/v1/operator/spaces/:spaceId/events", () =>
      HttpResponse.json({
        items: body.events.map((event, index) => ({
          eventId: event.eventId,
          name: index === 0 ? "가을 수련회" : `봄 행사 ${index}`,
          lifecycleStatus: "ACTIVE",
          startDate: "2026-10-24",
          endDate: "2026-10-25",
          place: "드림홀",
          eventType: "RETREAT",
        })),
        page: {
          number: 0,
          size: 100,
          totalItems: body.events.length,
          totalPages: body.events.length === 0 ? 0 : 1,
        },
      }),
    ),
  );
}

async function openChoices() {
  expect(await screen.findByRole("heading", { name: "조직에서 나갈까요?" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "계속" }));
  expect(await screen.findByRole("heading", { name: "어떤 행사를 계속 볼까요?" })).toBeInTheDocument();
}

describe("space leave", () => {
  it("opens from the event list", async () => {
    server.use(
      http.get("/api/v1/operator/spaces/:spaceId/me/leave-preview", () =>
        HttpResponse.json(previewBody([])),
      ),
    );
    await login({ userId: localUsers[0].userId });
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("link", { name: "조직에서 나가기" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "조직에서 나갈까요?" })).toBeInTheDocument();
    expect(screen.getByText("참여 중인 행사가 없어요. 나가면 이 조직에서 빠져요.")).toBeInTheDocument();
  });

  it("leaves with an empty keep list when there is no event", async () => {
    const posted: unknown[] = [];
    stubPreview(previewBody([]));
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/me/leave", async ({ request }) => {
        posted.push(await request.json());
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderLeave();
    expect(await screen.findByRole("heading", { name: "조직에서 나갈까요?" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "어떤 행사를 계속 볼까요?" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    expect(await screen.findByText("조직 찾기 화면")).toBeInTheDocument();
    expect(posted).toEqual([{ keepEventIds: [] }]);
  });

  it("starts on drop and changes the button when one event stays", async () => {
    const posted: unknown[] = [];
    stubPreview(previewBody([row(localEvent.eventId), row("00000000-0000-4000-8000-000000000021")]));
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/me/leave", async ({ request }) => {
        posted.push(await request.json());
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderLeave();
    await openChoices();
    expect(screen.getByText("가을 수련회")).toBeInTheDocument();
    expect(screen.queryByText("2026-10-24")).not.toBeInTheDocument();
    expect(screen.queryByText("드림홀")).not.toBeInTheDocument();
    expect(screen.queryByText("ACTIVE")).not.toBeInTheDocument();
    expect(screen.getAllByText("이 행사에서도 나가요.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "모두 나가기" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("radio", { name: "계속 보기" })[0]);
    expect(screen.getByText("이 행사만 계속 볼 수 있어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "행사 1개는 남기고 나가기" }));
    expect(await screen.findByRole("heading", { name: "나갔어요" })).toBeInTheDocument();
    expect(screen.getByText("행사 1개는 계속 볼 수 있어요.")).toBeInTheDocument();
    expect(screen.queryByText("가을 수련회")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 행사 보기" })).not.toBeInTheDocument();
    expect(posted).toEqual([{ keepEventIds: [localEvent.eventId] }]);

    fireEvent.click(screen.getByRole("button", { name: "조직 찾기" }));
    expect(await screen.findByText("조직 찾기 화면")).toBeInTheDocument();
  });

  it("returns the button to leave-all when the kept event is dropped again", async () => {
    stubPreview(previewBody([row(localEvent.eventId)]));
    renderLeave();
    await openChoices();
    fireEvent.click(screen.getByRole("radio", { name: "계속 보기" }));
    expect(screen.getByRole("button", { name: "행사 1개는 남기고 나가기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "그만 보기" }));
    expect(screen.getByRole("button", { name: "모두 나가기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("heading", { name: "조직에서 나갈까요?" })).toBeInTheDocument();
  });

  it("locks an accepted handover on drop", async () => {
    const posted: unknown[] = [];
    stubPreview(
      previewBody([row(localEvent.eventId, { isOwner: true, handoverAccepted: true })]),
    );
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/me/leave", async ({ request }) => {
        posted.push(await request.json());
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderLeave();
    await openChoices();
    expect(screen.getByText("그만 보기로 고정돼요.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "계속 보기" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "그만 보기" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Owner 넘기기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모두 나가기" }));
    expect(await screen.findByText("조직 찾기 화면")).toBeInTheDocument();
    expect(posted).toEqual([{ keepEventIds: [] }]);
  });

  it("blocks an owner row without a handover button", async () => {
    stubPreview(
      previewBody([row(localEvent.eventId, { isOwner: true })], {
        leaveBlocked: true,
        blockReason: "OWNER_ROLE_HELD",
      }),
    );
    renderLeave();
    expect(await screen.findByRole("heading", { name: "Owner를 넘겨야 나갈 수 있어요" })).toBeInTheDocument();
    expect(screen.getByText("가을 수련회")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모두 나가기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Owner 넘기기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업무 넘기기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(await screen.findByText("행사 목록 화면")).toBeInTheDocument();
  });

  it.each([
    ["HANDOVER_NOT_ACCEPTED", "인계 수락을 기다리고 있어요"],
    ["LAST_OWNER", "마지막 Owner예요"],
  ] as const)("shows the %s block", async (code, title) => {
    stubPreview(
      previewBody([row(localEvent.eventId)], {
        leaveBlocked: true,
        blockReason: code,
      }),
    );
    renderLeave();
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Owner 넘기기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업무 넘기기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모두 나가기" })).not.toBeInTheDocument();
  });

  it("shows a responsibility block without a task handover button", async () => {
    stubPreview(
      previewBody([row(localEvent.eventId, { openTasks: 2 })], {
        leaveBlocked: true,
        blockReason: "RESPONSIBILITY",
      }),
    );
    renderLeave();
    expect(await screen.findByRole("heading", { name: "맡은 업무가 남아 있어요" })).toBeInTheDocument();
    expect(screen.getByText("가을 수련회 · 2건")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업무 넘기기" })).not.toBeInTheDocument();
  });

  it("uses the many-tasks title at four open tasks", async () => {
    stubPreview(
      previewBody([row(localEvent.eventId, { openTasks: 4 })], {
        leaveBlocked: true,
        blockReason: "RESPONSIBILITY",
      }),
    );
    renderLeave();
    expect(await screen.findByRole("heading", { name: "맡은 업무가 4건 이상이에요" })).toBeInTheDocument();
  });

  it("shows the block returned by submit and hides the server detail", async () => {
    stubPreview(previewBody([row(localEvent.eventId)]));
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/me/leave", () =>
        problem(409, "LAST_OWNER", { detail: SECRET }),
      ),
    );
    renderLeave();
    await openChoices();
    fireEvent.click(screen.getByRole("button", { name: "모두 나가기" }));
    expect(await screen.findByRole("heading", { name: "마지막 Owner예요" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("reloads the preview when keepEventIds is rejected", async () => {
    let previews = 0;
    stubPreview(previewBody([row(localEvent.eventId)]), () => {
      previews += 1;
    });
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/me/leave", () =>
        problem(400, "VALIDATION_FAILED", { errors: [{ field: "keepEventIds" }], detail: SECRET }),
      ),
    );
    renderLeave();
    await openChoices();
    fireEvent.click(screen.getByRole("radio", { name: "계속 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "행사 1개는 남기고 나가기" }));
    expect(await screen.findByText("선택할 수 없는 행사가 있어요. 다시 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모두 나가기" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(previews).toBeGreaterThanOrEqual(2);
  });
});
