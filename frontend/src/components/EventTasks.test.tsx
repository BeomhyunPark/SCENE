import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests } from "../mocks/operatorStore";
import { setSchedulePeriod } from "../mocks/scheduleStore";
import { createTask as createTaskInStore } from "../mocks/taskStore";
import { EventTasks } from "./EventTasks";

function renderTasks() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/events/${localEvent.eventId}/tasks`]}>
        <Routes>
          <Route path="/events/:eventId/tasks" element={<EventTasks />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("event tasks", () => {
  it("renders the list and adds a task without a sort query", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks();
    expect(await screen.findByRole("button", { name: /안내문 출력/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    // The create form waits behind "+ 업무 추가" (#493, Figma P07-D02).
    expect(screen.queryByRole("textbox", { name: "업무명" })).not.toBeInTheDocument();
    const opener = await screen.findByRole("button", { name: "업무 추가" });
    opener.focus();
    fireEvent.click(opener);
    const drawer = screen.getByRole("dialog", { name: "새 업무 만들기" });
    expect(within(drawer).getByRole("textbox", { name: "업무명" })).toHaveFocus();
    fireEvent.change(within(drawer).getByRole("textbox", { name: "업무명" }), {
      target: { value: "간식 구매" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "업무 만들기" }));
    expect(await screen.findByRole("button", { name: /간식 구매/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "새 업무 만들기" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    const listed = operatorRequests.find((request) => request.method === "GET" && request.url.includes("/tasks"));
    expect(listed?.url).not.toContain("sort");
    const created = operatorRequests.find((request) => request.method === "POST" && request.url.endsWith("/tasks"));
    expect(created?.body).toEqual({ title: "간식 구매" });
  });

  it("hides the add button when the operator cannot write tasks", async () => {
    await login({ userId: localUsers[2].userId });
    renderTasks();
    expect(await screen.findByRole("button", { name: /안내문 출력/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업무 추가" })).not.toBeInTheDocument();
  });

  it("creates a task with an assignee picked in the drawer", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks();
    fireEvent.click(await screen.findByRole("button", { name: "업무 추가" }, { timeout: 4000 }));
    const drawer = screen.getByRole("dialog", { name: "새 업무 만들기" });
    fireEvent.change(within(drawer).getByRole("textbox", { name: "업무명" }), { target: { value: "현수막 주문" } });
    const assignee = within(drawer).getByRole("combobox", { name: "담당자" });
    fireEvent.click(assignee);
    fireEvent.click(await screen.findByRole("option", { name: "Local manager" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "업무 만들기" }));
    expect(await screen.findByRole("button", { name: /현수막 주문/ })).toBeInTheDocument();
    const created = operatorRequests.filter((request) => request.method === "POST" && request.url.endsWith("/tasks")).at(-1);
    expect(created?.body).toEqual({ title: "현수막 주문", assigneeUserId: localUsers[1].userId });
  });

  it("asks for a title, then closes with Esc or 취소 without creating", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks();
    fireEvent.click(await screen.findByRole("button", { name: "업무 추가" }, { timeout: 4000 }));
    const drawer = screen.getByRole("dialog", { name: "새 업무 만들기" });
    fireEvent.click(within(drawer).getByRole("button", { name: "업무 만들기" }));
    expect(within(drawer).getByRole("alert")).toHaveTextContent("업무 제목을 입력해 주세요.");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "업무 추가" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(operatorRequests.some((request) => request.method === "POST" && request.url.endsWith("/tasks"))).toBe(false);
  });
});

describe("task month (#475)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function wideScreen() {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width"), media: query, addEventListener() {}, removeEventListener() {} }));
  }

  async function addDated(title: string, startDate: string, dueDate: string) {
    fireEvent.click(await screen.findByRole("button", { name: "업무 추가" }, { timeout: 4000 }));
    const drawer = screen.getByRole("dialog", { name: "새 업무 만들기" });
    fireEvent.change(within(drawer).getByRole("textbox", { name: "업무명" }), { target: { value: title } });
    fireEvent.change(within(drawer).getByLabelText("시작일"), { target: { value: startDate } });
    fireEvent.change(within(drawer).getByLabelText("마감일"), { target: { value: dueDate } });
    fireEvent.click(within(drawer).getByRole("button", { name: "업무 만들기" }));
    await screen.findByRole("button", { name: new RegExp(title) });
  }

  it("adds a task with a period and shows it across its days in the month, with the event period and undated tasks", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-05T03:00:00Z"));
    wideScreen();
    setSchedulePeriod(localEvent.eventId, "2027-01-22", "2027-01-24");
    await login({ userId: localUsers[0].userId });
    renderTasks();
    await addDated("숙소 확정", "2027-01-11", "2027-01-13");
    const created = operatorRequests.filter((request) => request.method === "POST" && request.url.endsWith("/tasks")).at(-1);
    expect(created?.body).toEqual({ title: "숙소 확정", startDate: "2027-01-11", dueDate: "2027-01-13" });
    expect(screen.getByText("1/11–1/13")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "월" }));
    const grid = screen.getByRole("grid", { name: "2027년 1월" });
    for (const day of ["11", "12", "13"]) {
      const cell = within(grid).getByRole("gridcell", { name: new RegExp(`^1월 ${day}일 .* 업무 1개$`) });
      expect(within(cell).getByRole("button", { name: "숙소 확정" })).toBeInTheDocument();
    }
    expect(within(grid).getByRole("gridcell", { name: /^1월 22일 \(금\)$/ })).toHaveClass("task-month__day--event");
    expect(within(grid).getByRole("gridcell", { name: /^1월 5일/ })).toHaveClass("task-month__day--today");
    // The seeded checklist task has no date: it waits below the month.
    expect(within(screen.getByRole("region", { name: "날짜 없는 업무" })).getByRole("button", { name: /안내문 출력/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByRole("grid", { name: "2027년 2월" })).toBeInTheDocument();
  });

  it("opens the create drawer with the period when days are pressed on the month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-05T03:00:00Z"));
    wideScreen();
    await login({ userId: localUsers[0].userId });
    renderTasks();
    fireEvent.click(await screen.findByRole("button", { name: "월" }, { timeout: 4000 }));
    await screen.findByRole("button", { name: "업무 추가" });
    const grid = screen.getByRole("grid", { name: "2027년 1월" });
    fireEvent.pointerDown(within(grid).getByRole("gridcell", { name: /^1월 14일/ }));
    fireEvent.pointerEnter(within(grid).getByRole("gridcell", { name: /^1월 16일/ }));
    fireEvent.pointerUp(within(grid).getByRole("gridcell", { name: /^1월 16일/ }));
    const drawer = screen.getByRole("dialog", { name: "새 업무 만들기" });
    expect(within(drawer).getByLabelText("시작일")).toHaveValue("2027-01-14");
    expect(within(drawer).getByLabelText("마감일")).toHaveValue("2027-01-16");
    fireEvent.change(within(drawer).getByRole("textbox", { name: "업무명" }), { target: { value: "차량 배차표" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "업무 만들기" }));
    expect((await within(grid).findAllByRole("button", { name: "차량 배차표" }, { timeout: 4000 })).length).toBeGreaterThan(0);
    const created = operatorRequests.filter((request) => request.method === "POST" && request.url.endsWith("/tasks")).at(-1);
    expect(created?.body).toEqual({ title: "차량 배차표", startDate: "2027-01-14", dueDate: "2027-01-16" });
  });

  it("shows the month as a list by day on a phone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-05T03:00:00Z"));
    await login({ userId: localUsers[0].userId });
    renderTasks();
    await addDated("명찰 주문", "2027-01-08", "2027-01-08");
    fireEvent.click(screen.getByRole("button", { name: "월" }));
    const list = screen.getByRole("list", { name: "2027년 1월" });
    const day = within(list).getByText("1월 8일 (금)").closest("li")!;
    expect(within(day).getByRole("button", { name: "명찰 주문" })).toBeInTheDocument();
    expect(within(list).getByText("오늘")).toBeInTheDocument();
  });

  it("refuses a start date after the due date", async () => {
    await login({ userId: localUsers[0].userId });
    renderTasks();
    fireEvent.click(await screen.findByRole("button", { name: "업무 추가" }, { timeout: 4000 }));
    const drawer = screen.getByRole("dialog", { name: "새 업무 만들기" });
    fireEvent.change(within(drawer).getByRole("textbox", { name: "업무명" }), { target: { value: "거꾸로" } });
    fireEvent.change(within(drawer).getByLabelText("시작일"), { target: { value: "2027-01-20" } });
    fireEvent.change(within(drawer).getByLabelText("마감일"), { target: { value: "2027-01-10" } });
    // The date fields bound each other, so the browser stops the form before it is sent.
    expect(within(drawer).getByLabelText("시작일")).toBeInvalid();
    fireEvent.click(within(drawer).getByRole("button", { name: "업무 만들기" }));
    expect(operatorRequests.some((request) => request.method === "POST" && (request.body as { title?: string } | undefined)?.title === "거꾸로")).toBe(false);
  });

  it("is refused by the server when a start comes without a due date or after it", () => {
    const owner = localUsers[0].userId;
    expect(createTaskInStore(localEvent.eventId, owner, { title: "시작만", startDate: "2027-01-10" })).toMatchObject({ code: "VALIDATION_FAILED", errors: [{ field: "dueDate" }] });
    expect(createTaskInStore(localEvent.eventId, owner, { title: "거꾸로", startDate: "2027-01-20", dueDate: "2027-01-10" })).toMatchObject({ code: "VALIDATION_FAILED", errors: [{ field: "dueDate" }] });
    expect(createTaskInStore(localEvent.eventId, owner, { title: "날짜 아님", dueDate: "1월 10일" })).toMatchObject({ code: "VALIDATION_FAILED", errors: [{ field: "dueDate" }] });
    expect(createTaskInStore(localEvent.eventId, owner, { title: "하루", dueDate: "2027-01-10" })).toMatchObject({ startDate: null, dueDate: "2027-01-10" });
  });
});

