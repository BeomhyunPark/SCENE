import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { login } from "../api/session";
import type { TaskSuggester, TaskSuggestion, TaskSuggestionInput } from "../ai/taskSuggestions";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests } from "../mocks/operatorStore";
import { server } from "../mocks/server";
import { EventTasks } from "./EventTasks";

const camp = {
  eventId: localEvent.eventId,
  name: "Local event",
  lifecycleStatus: "DRAFT",
  lifecycleVersion: 0,
  startDate: "2026-10-24",
  endDate: "2026-10-24",
  place: null,
  eventType: "CAMP",
};

function renderTasks(suggester?: TaskSuggester) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/events/${localEvent.eventId}/tasks`]}>
        <Routes>
          <Route path="/events/:eventId/tasks" element={<EventTasks suggester={suggester} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function spySuggester(items: TaskSuggestion[]): { suggester: TaskSuggester; inputs: TaskSuggestionInput[] } {
  const inputs: TaskSuggestionInput[] = [];
  return {
    inputs,
    suggester: {
      async suggestTasks(input) {
        inputs.push(input);
        return items;
      },
    },
  };
}

const sample: TaskSuggestion[] = [
  { suggestionId: "a", title: "차량 배차", checklist: ["출발 시각"], source: "TEMPLATE" },
  { suggestionId: "b", title: "회비 안내", checklist: ["금액"], source: "TEMPLATE" },
  { suggestionId: "c", title: "안내문 출력", checklist: ["출력"], source: "TEMPLATE" },
];

async function openPanel() {
  fireEvent.click(await screen.findByRole("button", { name: "추천 업무 보기" }));
}

describe("task suggestions", () => {
  it("uses the server event type and hides the type chips", async () => {
    server.use(http.get("/api/v1/operator/events/:eventId", () => HttpResponse.json(camp)));
    await login({ userId: localUsers[0].userId });
    const spy = spySuggester(sample);
    renderTasks(spy.suggester);
    await openPanel();
    expect(await screen.findByRole("checkbox", { name: /차량 배차/ })).toBeInTheDocument();
    expect(spy.inputs[0]).toEqual({ eventType: "CAMP", durationBucket: "ONE_DAY" });
    expect(screen.queryByText("행사 유형을 고르면 더 맞는 추천을 볼 수 있어요.")).not.toBeInTheDocument();
  });

  it("shows type chips when the server type is empty and does not patch the event", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    await login({ userId: localUsers[0].userId });
    const spy = spySuggester(sample);
    renderTasks(spy.suggester);
    await openPanel();
    expect(await screen.findByText("행사 유형을 고르면 더 맞는 추천을 볼 수 있어요.")).toBeInTheDocument();
    expect(spy.inputs[0]).toEqual({ eventType: null, durationBucket: "UNKNOWN" });
    fireEvent.click(screen.getByRole("button", { name: "수련회" }));
    await screen.findByRole("checkbox", { name: /차량 배차/ });
    expect(spy.inputs.at(-1)).toEqual({ eventType: "RETREAT", durationBucket: "UNKNOWN" });
    expect(operatorRequests.some((request) => request.method === "PATCH")).toBe(false);
    expect(getItem.mock.calls.some(([key]) => String(key).startsWith("scene-event-type"))).toBe(false);
    getItem.mockRestore();
  });

  it("can browse another type, starts with nothing selected, and skips titles that exist", async () => {
    await login({ userId: localUsers[0].userId });
    const spy = spySuggester(sample);
    renderTasks(spy.suggester);
    await openPanel();
    expect(await screen.findByRole("button", { name: "선택한 업무 추가 (0)" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /안내문 출력/ })).toBeDisabled();
    expect(screen.getByText("이미 있어요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다른 추천도 보기" }));
    fireEvent.click(within(screen.getByRole("group", { name: "다른 추천" })).getByRole("button", { name: "비전트립" }));
    await screen.findByRole("checkbox", { name: /차량 배차/ });
    expect(spy.inputs.at(-1)?.eventType).toBe("VISION_TRIP");
  });

  it("posts only the chosen titles", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks(spySuggester(sample).suggester);
    await openPanel();
    fireEvent.click(await screen.findByRole("checkbox", { name: /차량 배차/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /회비 안내/ }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 업무 추가 (2)" }));
    expect(await screen.findByText("업무 2개를 추가했어요.")).toBeInTheDocument();
    const posts = operatorRequests.filter(
      (request) => request.method === "POST" && request.url.endsWith("/tasks"),
    );
    expect(posts.map((request) => request.body)).toEqual([{ title: "차량 배차" }, { title: "회비 안내" }]);
  });

  it("keeps a failed suggestion selected", async () => {
    server.use(
      http.post("/api/v1/operator/events/:eventId/tasks", async ({ request }) => {
        const body = (await request.json()) as { title?: string };
        if (body.title === "회비 안내") {
          return HttpResponse.json({ code: "UNEXPECTED", detail: "hidden" }, { status: 500 });
        }
        return HttpResponse.json(
          {
            taskId: crypto.randomUUID(),
            title: body.title,
            status: "TODO",
            version: 0,
            checklist: { done: 0, total: 0, items: [] },
            assigneeUserId: null,
            assigneeDisplayName: null,
            completedByUserId: null,
            completedByDisplayName: null,
            completedAt: null,
            actions: { canCheck: true, canComplete: true, canReopen: false, blockedReason: null },
            outcome: null,
          },
          { status: 201 },
        );
      }),
    );
    await login({ userId: localUsers[0].userId });
    renderTasks(spySuggester(sample).suggester);
    await openPanel();
    fireEvent.click(await screen.findByRole("checkbox", { name: /차량 배차/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /회비 안내/ }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 업무 추가 (2)" }));
    expect(await screen.findByText("1개는 추가하지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /회비 안내/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /차량 배차/ })).not.toBeChecked();
  });

  it("keeps manual entry when the suggester fails", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks({
      suggestTasks() {
        return Promise.reject(new Error("down"));
      },
    });
    await openPanel();
    expect(await screen.findByText("추천을 불러오지 못했어요 · 직접 추가해 주세요")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 제목" })).toBeInTheDocument();
  });

  it("shows the failure copy when the suggester times out", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks({
      suggestTasks() {
        return new Promise(() => undefined);
      },
    });
    const open = await screen.findByRole("button", { name: "추천 업무 보기" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(open);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.getByText("추천을 불러오지 못했어요 · 직접 추가해 주세요")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
