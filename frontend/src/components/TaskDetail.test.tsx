import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { server } from "../mocks/server";
import { EventList } from "./EventList";
import { TaskDetail } from "./TaskDetail";

const taskId = "00000000-0000-4000-8000-000000000040";

function renderDetail() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/events/${localEvent.eventId}/tasks/${taskId}`]}>
        <Routes>
          <Route path="/events/:eventId/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/events/:eventId/tasks" element={<p>업무 목록</p>} />
          <Route path="/events" element={<EventList />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function progress(overrides: Record<string, unknown>) {
  return {
    taskId,
    status: "TODO",
    version: 1,
    checklist: { done: 2, total: 2, items: [] },
    assigneeUserId: null,
    assigneeDisplayName: null,
    completedByUserId: null,
    completedByDisplayName: null,
    completedAt: null,
    actions: { canCheck: true, canComplete: true, canReopen: false, blockedReason: null },
    outcome: null,
    ...overrides,
  };
}

function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: "about:blank", title: code, status, detail: "hidden", code, ...extra },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

async function enableComplete() {
  fireEvent.click(await screen.findByRole("checkbox", { name: "출력" }));
  expect(await screen.findByRole("button", { name: "완료" })).toBeEnabled();
}

describe("task detail", () => {
  it("treats already done as a quiet success", async () => {
    server.use(
      http.post("/api/v1/operator/events/:eventId/tasks/:taskId/complete", () =>
        HttpResponse.json(progress({ status: "DONE", outcome: "ALREADY_DONE", actions: { canCheck: false, canComplete: false, canReopen: true, blockedReason: "TASK_DONE" } })),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    await enableComplete();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(await screen.findByRole("status")).toHaveTextContent("이미 완료된 업무예요.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces the detail when the version conflicts", async () => {
    server.use(
      http.post("/api/v1/operator/events/:eventId/tasks/:taskId/complete", () =>
        problem(409, "TASK_VERSION_CONFLICT", {
          task: progress({ status: "DOING", version: 4, actions: { canCheck: true, canComplete: false, canReopen: false, blockedReason: "CHECKLIST_INCOMPLETE" } }),
        }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    await enableComplete();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다른 사람이 먼저 이 업무를 바꿨어요");
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("reports an incomplete checklist from the server", async () => {
    server.use(
      http.post("/api/v1/operator/events/:eventId/tasks/:taskId/complete", () =>
        problem(409, "INVALID_TASK_STATE", { reason: "CHECKLIST_INCOMPLETE", task: progress({ status: "DOING" }) }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    await enableComplete();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("체크 항목을 모두 확인해야 완료할 수 있어요.");
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("reports a cancelled task", async () => {
    server.use(
      http.post("/api/v1/operator/events/:eventId/tasks/:taskId/complete", () =>
        problem(409, "INVALID_TASK_STATE", { reason: "TASK_CANCELLED", task: progress({ status: "CANCELLED" }) }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    await enableComplete();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("취소된 업무예요.");
  });

  it("reports a finished task that still needs reopen", async () => {
    server.use(
      http.post("/api/v1/operator/events/:eventId/tasks/:taskId/reopen", () =>
        problem(409, "INVALID_TASK_STATE", { reason: "TASK_DONE", task: progress({ status: "DONE" }) }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    await enableComplete();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(await screen.findByText("완료")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "다시 진행" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("완료된 업무예요. 다시 진행한 뒤 바꿀 수 있어요.");
  });

  it("says the task is missing and offers the list", async () => {
    server.use(
      http.get("/api/v1/operator/events/:eventId/tasks/:taskId", () => problem(404, "RESOURCE_NOT_FOUND")),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    expect(await screen.findByText("업무를 찾을 수 없어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(await screen.findByText("업무 목록")).toBeInTheDocument();
  });

  it("reloads the detail when the write is forbidden", async () => {
    server.use(
      http.patch("/api/v1/operator/events/:eventId/tasks/:taskId", () => problem(403, "FORBIDDEN")),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "제목 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이 업무를 바꿀 권한이 없어요.");
    expect(screen.getByRole("heading", { name: "안내문 출력" })).toBeInTheDocument();
  });

  it("leaves the event when membership is gone", async () => {
    server.use(
      http.patch("/api/v1/operator/events/:eventId/tasks/:taskId", () => problem(403, "NOT_A_MEMBER")),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "제목 저장" }));
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
  });

  it("becomes read only when the event is archived", async () => {
    server.use(
      http.post("/api/v1/operator/events/:eventId/tasks/:taskId/complete", () =>
        problem(409, "EVENT_ARCHIVED", { eventStatus: "ARCHIVED", task: progress({ status: "TODO" }) }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    await enableComplete();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("보관된 행사는 바꿀 수 없어요.");
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });

  it("points a title error at the field", async () => {
    server.use(
      http.patch("/api/v1/operator/events/:eventId/tasks/:taskId", () =>
        problem(400, "VALIDATION_FAILED", { errors: [{ field: "title" }] }),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "제목 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("제목을 확인해 주세요.");
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("keeps the form when the network fails", async () => {
    server.use(http.patch("/api/v1/operator/events/:eventId/tasks/:taskId", () => HttpResponse.error()));
    await login({ userId: localUsers[0].userId });
    renderDetail();
    const input = await screen.findByRole("textbox", { name: "업무 제목" });
    fireEvent.change(input, { target: { value: "바꾼 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "제목 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했어요. 다시 시도해 주세요.");
    expect(input).toHaveValue("바꾼 제목");
  });

  it("applies a no-change check without an alert", async () => {
    server.use(
      http.put("/api/v1/operator/events/:eventId/tasks/:taskId/items/:itemId", () =>
        HttpResponse.json(
          progress({
            version: 1,
            outcome: "NO_CHANGE",
            checklist: {
              done: 1,
              total: 2,
              items: [
                {
                  itemId: "00000000-0000-4000-8000-000000000041",
                  label: "출력",
                  position: 0,
                  checked: false,
                  checkedByUserId: null,
                  checkedByDisplayName: null,
                  checkedAt: null,
                },
                {
                  itemId: "00000000-0000-4000-8000-000000000042",
                  label: "배포",
                  position: 1,
                  checked: true,
                  checkedByUserId: localUsers[0].userId,
                  checkedByDisplayName: "Local owner",
                  checkedAt: "2026-10-16T00:00:00Z",
                },
              ],
            },
          }),
        ),
      ),
    );
    await login({ userId: localUsers[0].userId });
    renderDetail();
    fireEvent.click(await screen.findByRole("checkbox", { name: "배포" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "배포" })).toBeChecked());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
