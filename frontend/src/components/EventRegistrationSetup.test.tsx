import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { createForm } from "../api/forms";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { setLifecycle } from "../mocks/operatorStore";
import { operatorRequests } from "../mocks/operatorStore";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { EventRegistrationSetup } from "./EventRegistrationSetup";

function renderSetup() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/events/${localEvent.eventId}/participants/setup`]}>
        <Routes>
          <Route path="/events/:eventId/participants/setup" element={<EventRegistrationSetup />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("event registration setup", () => {
  it("creates a form and shows the system fields", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    expect(await screen.findByText("이름")).toBeInTheDocument();
    expect(screen.getByText("전화")).toBeInTheDocument();
    expect(screen.getAllByText("기본 항목")).toHaveLength(2);
    expect(screen.getByText("2개")).toBeInTheDocument();
    expect(screen.queryByText("참석 여부")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "질문" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "질문 삭제" })).not.toBeInTheDocument();
    expect(screen.getAllByText("준비 중")).toHaveLength(2);
    const listed = operatorRequests.find((request) => request.method === "GET" && request.url.includes("/forms?"));
    expect(listed?.url).not.toContain("sort");
    const created = operatorRequests.find((request) => request.method === "POST" && request.url.endsWith("/forms"));
    expect(created?.body).toEqual({});
  });

  it("hides another question once one custom field exists", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    fireEvent.change(await screen.findByRole("textbox", { name: "질문" }), {
      target: { value: "주민번호 뒷자리" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(await screen.findByRole("textbox", { name: "추가 질문" })).toHaveValue("주민번호 뒷자리");
    expect(screen.queryByRole("textbox", { name: "질문" })).not.toBeInTheDocument();
    expect(screen.getByText("지금은 추가 질문을 하나만 받을 수 있어요.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "질문 삭제" })).toHaveLength(1);
    const added = operatorRequests.find((request) => request.method === "POST" && request.url.endsWith("/fields"));
    expect(added?.body).toEqual({ label: "주민번호 뒷자리" });
  });

  it("renames and deletes the custom question", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    fireEvent.change(await screen.findByRole("textbox", { name: "질문" }), { target: { value: "티셔츠 사이즈" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    const editor = await screen.findByRole("textbox", { name: "추가 질문" });
    fireEvent.change(editor, { target: { value: "간식 알레르기" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("textbox", { name: "추가 질문" })).toHaveValue("간식 알레르기");
    fireEvent.click(screen.getByRole("button", { name: "질문 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("textbox", { name: "질문" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "질문 삭제" })).not.toBeInTheDocument();
  });

  it("activates a draft before opening applications, then closes them", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    expect(await screen.findByText("공개 전")).toBeInTheDocument();
    const mark = operatorRequests.length;
    fireEvent.click(await screen.findByRole("button", { name: "신청 열기" }));
    expect(await screen.findByText("행사를 시작해야 신청을 열 수 있어요. 지금 시작할까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(await screen.findByText("신청 받는 중")).toBeInTheDocument();
    const writes = operatorRequests.slice(mark).filter((request) => request.method === "POST" || request.method === "PATCH");
    const activateAt = writes.findIndex((request) => request.url.endsWith("/activate"));
    const acceptAt = writes.findIndex(
      (request) => request.method === "PATCH" && request.url.includes("/forms/") && !request.url.includes("/fields"),
    );
    expect(activateAt).toBeGreaterThanOrEqual(0);
    expect(acceptAt).toBeGreaterThan(activateAt);
    expect(writes[activateAt]?.body).toEqual({ expectedLifecycleVersion: 0 });
    expect(writes[acceptAt]?.body).toEqual({ acceptingApplications: true });
    fireEvent.click(screen.getByRole("button", { name: "신청 닫기" }));
    expect(await screen.findByText("공개 전")).toBeInTheDocument();
  });

  it("explains when applications cannot be opened yet", async () => {
    await login({ userId: localUsers[0].userId });
    server.use(
      http.patch("/api/v1/operator/events/:eventId/forms/:formId", () =>
        problem(409, "INVALID_STATE_TRANSITION", { detail: "hidden from the screen" }),
      ),
    );
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: "신청 열기" }));
    fireEvent.click(await screen.findByRole("button", { name: "시작하기" }));
    expect(await screen.findByText("진행 중인 행사에서만 신청을 열 수 있어요.")).toBeInTheDocument();
    expect(screen.queryByText("hidden from the screen")).not.toBeInTheDocument();
  });

  it("explains a stale activation without retrying", async () => {
    let activations = 0;
    server.use(
      http.post("/api/v1/operator/events/:eventId/activate", () => {
        activations += 1;
        return problem(409, "CONCURRENT_MODIFICATION", {
          lifecycleVersion: 3,
          currentStatus: "DRAFT",
          detail: "server detail hidden",
        });
      }),
    );
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: "신청 열기" }));
    fireEvent.click(await screen.findByRole("button", { name: "시작하기" }));
    expect(await screen.findByText("다른 변경이 먼저 반영됐어요. 다시 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("server detail hidden")).not.toBeInTheDocument();
    expect(activations).toBe(1);
  });

  it("hides the open button after the event has ended", async () => {
    setLifecycle(localEvent.eventId, "ENDED", 2);
    await login({ userId: localUsers[0].userId });
    await createForm(localEvent.eventId);
    renderSetup();
    expect(await screen.findByText("이름")).toBeInTheDocument();
    expect(screen.getByText("종료된 행사는 신청을 열 수 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신청 열기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신청 닫기" })).not.toBeInTheDocument();
  });

  it("stays read-only without FORM_WRITE", async () => {
    await login({ userId: localUsers[0].userId });
    await createForm(localEvent.eventId);
    await login({ userId: localUsers[1].userId });
    renderSetup();
    expect(await screen.findByText("이름")).toBeInTheDocument();
    await waitFor(() => {
      expect(operatorRequests.some((request) => request.url.includes("/permissions"))).toBe(true);
    });
    expect(screen.queryByRole("button", { name: "신청서 만들기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신청 열기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "질문" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "질문 삭제" })).not.toBeInTheDocument();
  });
});
