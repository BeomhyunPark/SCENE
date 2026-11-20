import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { createEvent } from "../api/events";
import { addField, createForm, getForm, listForms } from "../api/forms";
import { markSubmitted } from "../mocks/formStore";
import { login } from "../api/session";
import { localEvent, localSpace, localUsers } from "../mocks/fixtures/seed";
import { revokePermissions } from "../mocks/taskStore";
import { setLifecycle } from "../mocks/operatorStore";
import { operatorRequests } from "../mocks/operatorStore";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { EventRegistrationSetup } from "./EventRegistrationSetup";

function renderSetup(eventId: string = localEvent.eventId) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/events/${eventId}/participants/setup`]}>
        <Routes>
          <Route path="/events/:eventId/participants/setup" element={<EventRegistrationSetup />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The question list. The preview beside it repeats the same labels, so label checks look here. */
async function questionList() {
  return within(await screen.findByRole("region", { name: "받을 정보" }, { timeout: 4000 }));
}

async function waitForField(label: string) {
  let found: { fieldId: string } | undefined;
  await waitFor(async () => {
    const page = await listForms(localEvent.eventId, { page: 0, size: 50 });
    const detail = await getForm(localEvent.eventId, page.items[0].formId);
    found = detail.fields.find((field) => field.label === label);
    expect(found).toBeDefined();
  });
  return found!;
}

describe("event registration setup", () => {
  it("creates a form and shows the system fields", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    const list = await questionList();
    expect(await list.findByText("이름")).toBeInTheDocument();
    expect(list.getByText("전화")).toBeInTheDocument();
    expect(list.getByText("또래")).toBeInTheDocument();
    expect(list.getAllByText("기본 항목")).toHaveLength(3);
    expect(list.getByText("3개")).toBeInTheDocument();
    // The seed event has no dates, so the setup card explains why it cannot generate questions.
    expect(screen.getByText(/이 행사에는 날짜가 없어서 자동 설정을 쓸 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "참가자 화면 미리보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "직접 질문 추가" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삭제$/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("준비 중")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "완료 안내 문구" })).toHaveValue("");
    const listed = operatorRequests.find((request) => request.method === "GET" && request.url.includes("/forms?"));
    expect(listed?.url).not.toContain("sort");
    const created = operatorRequests.find((request) => request.method === "POST" && request.url.endsWith("/forms"));
    expect(created?.body).toEqual({});
  });

  it("adds several typed questions, with a privacy warning on the label", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));

    fireEvent.click(await screen.findByRole("button", { name: "직접 질문 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "주민번호 뒷자리" } });
    expect(await screen.findByRole("status", {}, { timeout: 2000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    const list = await questionList();
    expect(await list.findByText("주민번호 뒷자리")).toBeInTheDocument();
    const first = operatorRequests.filter((request) => request.method === "POST" && request.url.endsWith("/fields"));
    expect(first.at(-1)?.body).toMatchObject({ label: "주민번호 뒷자리", answerType: "SHORT_TEXT", required: false });

    fireEvent.click(screen.getByRole("button", { name: "직접 질문 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "참석 방식" } });
    fireEvent.change(screen.getByRole("combobox", { name: "답변 유형" }), { target: { value: "SINGLE_CHOICE" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "필수" }));
    fireEvent.change(screen.getByRole("textbox", { name: "보기 1" }), { target: { value: "전체" } });
    fireEvent.change(screen.getByRole("textbox", { name: "보기 2" }), { target: { value: "부분" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    expect(await list.findByText("참석 방식")).toBeInTheDocument();
    expect(list.getByText("단수선택")).toBeInTheDocument();
    expect(list.getByText("필수")).toBeInTheDocument();
    expect(list.getByText("5개")).toBeInTheDocument();
    // The preview shows the new question the way a participant gets it.
    expect(within(screen.getByRole("region", { name: "참가자 화면 미리보기" })).getByText("부분")).toBeInTheDocument();
    const second = operatorRequests.filter((request) => request.method === "POST" && request.url.endsWith("/fields"));
    expect(second.at(-1)?.body).toMatchObject({
      label: "참석 방식",
      answerType: "SINGLE_CHOICE",
      required: true,
      config: { options: [{ label: "전체" }, { label: "부분" }], allowOther: false, display: "LIST" },
    });
  });

  it("checks a choice question needs an option before saving", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: "직접 질문 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "티셔츠" } });
    fireEvent.change(screen.getByRole("combobox", { name: "답변 유형" }), { target: { value: "DROPDOWN" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("보기를 하나 이상 써 주세요.");
    expect(operatorRequests.some((request) => request.method === "POST" && request.url.endsWith("/fields"))).toBe(
      false,
    );
  });

  it("adds a conditional question and edits, moves, and deletes questions", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: "직접 질문 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "자차로 오나요?" } });
    fireEvent.change(screen.getByRole("combobox", { name: "답변 유형" }), { target: { value: "YES_NO" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    const list = await questionList();
    expect(await list.findByText("자차로 오나요?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "직접 질문 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "몇 명 태울 수 있나요?" } });
    fireEvent.change(screen.getByRole("combobox", { name: "답변 유형" }), { target: { value: "NUMBER" } });
    const carId = (await waitForField("자차로 오나요?")).fieldId;
    fireEvent.change(screen.getByRole("combobox", { name: "조건 질문" }), { target: { value: carId } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    expect(await screen.findByText("'자차로 오나요?'에 예일 때 보여요")).toBeInTheDocument();
    const posted = operatorRequests.filter((request) => request.method === "POST" && request.url.endsWith("/fields"));
    expect(posted.at(-1)?.body).toMatchObject({ showWhen: { fieldId: carId, equals: true } });

    fireEvent.click(screen.getByRole("button", { name: "몇 명 태울 수 있나요? 위로" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("앞에 있는 선택형");

    fireEvent.click(screen.getByRole("button", { name: "자차로 오나요? 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "자가용으로 오나요?" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await list.findByText("자가용으로 오나요?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "자가용으로 오나요? 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다른 질문의 표시 조건");

    fireEvent.click(screen.getByRole("button", { name: "몇 명 태울 수 있나요? 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(list.queryByText("몇 명 태울 수 있나요?")).not.toBeInTheDocument());
  });

  it("offers hiding instead of deleting once applications arrive", async () => {
    await login({ userId: localUsers[0].userId });
    const created = await createForm(localEvent.eventId);
    await addField(localEvent.eventId, created.formId, {
      label: "식사",
      answerType: "MULTI_CHOICE",
      config: { options: [{ label: "점심" }, { label: "저녁" }] },
    });
    markSubmitted(localEvent.eventId, created.formId);
    renderSetup();
    expect(await screen.findByText(/신청이 들어와서/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "식사 삭제" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "식사 숨기기" }));
    expect(await screen.findByText("숨김")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "식사 수정" }));
    expect(screen.getByRole("combobox", { name: "답변 유형" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "보기 1 지우기" })).toBeDisabled();
  });

  it("writes the completion notice as plain text, previews it, and edits it after applications arrive", async () => {
    await login({ userId: localUsers[0].userId });
    const created = await createForm(localEvent.eventId);
    markSubmitted(localEvent.eventId, created.formId);
    renderSetup();
    const box = await screen.findByRole("textbox", { name: "완료 안내 문구" }, { timeout: 4000 });
    const save = screen.getByRole("button", { name: "안내 저장" });
    expect(save).toBeDisabled();
    const preview = within(screen.getByRole("region", { name: "참가자 화면 미리보기" }));
    expect(preview.getByText("완료 안내를 쓰면 여기에 보여요.")).toBeInTheDocument();

    const text = "참가비 3만원\n신한 110-000 <b>홍길동</b>\nhttps://example.com/pay";
    fireEvent.change(box, { target: { value: `  ${text}  ` } });
    // The preview follows the draft and shows tags as typed.
    const shown = preview.getByText(/참가비 3만원/);
    expect(shown.textContent).toBe(text);
    expect(shown.querySelector("b")).toBeNull();
    fireEvent.click(save);
    expect(await screen.findByText("저장했어요.")).toBeInTheDocument();
    const put = operatorRequests.filter((request) => request.method === "PUT" && request.url.endsWith("/completion-notice"));
    expect(put.at(-1)?.body).toEqual({ completionNotice: `  ${text}  ` });
    expect((await getForm(localEvent.eventId, created.formId)).completionNotice).toBe(text);
    expect(box).toHaveValue(text);

    fireEvent.change(box, { target: { value: "가".repeat(1001) } });
    expect(screen.getByText("1001/1000자")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("1000자까지 쓸 수 있어요.");
    expect(save).toBeDisabled();

    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.click(save);
    expect(await screen.findByText("안내를 비웠어요.")).toBeInTheDocument();
    expect(put.length).toBeGreaterThan(0);
    expect(operatorRequests.filter((request) => request.url.endsWith("/completion-notice")).at(-1)?.body).toEqual({
      completionNotice: null,
    });
    expect((await getForm(localEvent.eventId, created.formId)).completionNotice).toBeNull();
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
    expect(await (await questionList()).findByText("이름")).toBeInTheDocument();
    expect(screen.getByText("종료된 행사는 신청을 열 수 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신청 열기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신청 닫기" })).not.toBeInTheDocument();
  });

  it("stays read-only without FORM_WRITE", async () => {
    await login({ userId: localUsers[0].userId });
    await createForm(localEvent.eventId);
    // MANAGER holds FORM_WRITE by default (DEC-079 Follow-up 2026-11-20); this one has a REVOKE.
    revokePermissions(localEvent.eventId, localUsers[1].userId, ["FORM_WRITE"]);
    await login({ userId: localUsers[1].userId });
    renderSetup();
    expect(await (await questionList()).findByText("이름")).toBeInTheDocument();
    await waitFor(() => {
      expect(operatorRequests.some((request) => request.url.includes("/permissions"))).toBe(true);
    });
    expect(screen.queryByRole("button", { name: "신청서 만들기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "신청 열기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "질문" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "질문 삭제" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "완료 안내 문구" })).not.toBeInTheDocument();
    expect(screen.getByText("아직 안내가 없어요.")).toBeInTheDocument();
  });
  it("builds the form from the setup card and lets the operator click through the branches", async () => {
    await login({ userId: localUsers[0].userId });
    const retreat = await createEvent(localSpace.spaceId, {
      name: "겨울 수련회",
      startDate: "2027-01-22",
      endDate: "2027-01-24",
    });
    renderSetup(retreat.eventId);
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));

    // The card starts from a usual retreat: three days, partial attendance, bus, car, transit.
    expect(await screen.findByRole("checkbox", { name: "1일차 저녁" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "1일차 아침" })).not.toBeChecked();
    expect(screen.getByRole("rowheader", { name: "3일차 · 1월 24일 (일)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "이름" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /집회만 받기/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^집회 차량/ }));
    // A new card asks partial attendees for arrival and departure only; this test asks slot by slot.
    expect(screen.getByRole("radio", { name: /도착~출발만 받기/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /칸마다 고르기/ }));
    fireEvent.click(screen.getByRole("button", { name: "질문 만들기" }));

    const list = await questionList();
    expect(await list.findByText("참석 방식")).toBeInTheDocument();
    expect(list.getByText("숙박하는 밤을 모두 골라주세요")).toBeInTheDocument();
    expect(list.getByText("보기: 첫째 밤 (1월 22일 (금)), 둘째 밤 (1월 23일 (토))")).toBeInTheDocument();
    expect(list.getByText("개인정보 수집·이용에 동의합니다")).toBeInTheDocument();
    const sent = operatorRequests.find((request) => request.method === "PUT" && request.url.endsWith("/setup"));
    expect(sent?.body).toMatchObject({
      gender: true,
      attendance: { partial: true, worshipOnly: true, mode: "SLOTS" },
      transport: { groupBus: true, worshipShuttle: true, car: true },
    });
    expect((sent?.body as { schedule: unknown[] }).schedule).toHaveLength(3);
    expect(sent?.body).not.toHaveProperty("generatedFor");

    // Preview: partial attendance opens its questions, and driving hides the way back.
    const preview = within(screen.getByRole("region", { name: "참가자 화면 미리보기" }));
    expect(preview.queryByText(/언제 도착할 예정인가요/)).not.toBeInTheDocument();
    expect(preview.queryByRole("radio", { name: "집회 차량" })).not.toBeInTheDocument();
    fireEvent.click(preview.getByRole("radio", { name: "부분 참석" }));
    expect(preview.getByText(/언제 도착할 예정인가요/)).toBeInTheDocument();
    expect(preview.getByRole("checkbox", { name: "첫째 밤 (1월 22일 (금))" })).toBeInTheDocument();
    expect(preview.getByRole("radio", { name: "집회 차량" })).toBeInTheDocument();
    fireEvent.click(preview.getByRole("radio", { name: "대중교통" }));
    expect(preview.getByText(/어떻게 돌아가세요/)).toBeInTheDocument();
    fireEvent.click(preview.getByRole("radio", { name: "자차 (직접 운전)" }));
    expect(preview.queryByText(/어떻게 돌아가세요/)).not.toBeInTheDocument();
    expect(preview.getByText(/동승자를 태울 수 있어요/)).toBeInTheDocument();
    fireEvent.click(preview.getByRole("button", { name: "처음부터" }));
    expect(preview.queryByText(/동승자를 태울 수 있어요/)).not.toBeInTheDocument();

    // A generated question takes new wording only, and keeps it when the setup changes.
    expect(list.queryByRole("button", { name: "참석 방식 삭제" })).not.toBeInTheDocument();
    fireEvent.click(list.getByRole("button", { name: "참석 방식 수정" }));
    expect(screen.queryByRole("combobox", { name: "답변 유형" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "어떻게 참석하세요?" } });
    fireEvent.change(screen.getByRole("textbox", { name: "보기 1 문구" }), { target: { value: "전체 참석 (2박 3일)" } });
    fireEvent.click(screen.getByRole("button", { name: "문구 저장" }));
    expect(await list.findByText("어떻게 참석하세요?")).toBeInTheDocument();
    expect(preview.getByRole("radio", { name: "전체 참석 (2박 3일)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /부분 참석 받기/ }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    await waitFor(() => expect(list.queryByText("숙박하는 밤을 모두 골라주세요")).not.toBeInTheDocument());
    expect(list.getByText("어떻게 참석하세요?")).toBeInTheDocument();
    expect(list.getByText("보기: 전체 참석 (2박 3일), 집회만 참석")).toBeInTheDocument();
  });

  it("asks partial attendees for arrival and departure only, and previews the range (DEC-074)", async () => {
    await login({ userId: localUsers[0].userId });
    const retreat = await createEvent(localSpace.spaceId, {
      name: "도착 출발 수련회",
      startDate: "2027-01-22",
      endDate: "2027-01-24",
    });
    renderSetup(retreat.eventId);
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));

    // The card explains each mode and shows a sample from its own schedule.
    expect(await screen.findByRole("radio", { name: /도착~출발만 받기/ })).toBeChecked();
    const sample = within(screen.getByLabelText("참가자에게 보이는 모습"));
    expect(sample.getByText("1월 22일 (금) 저녁부터")).toBeInTheDocument();
    expect(sample.getByText("1월 24일 (일) 점심까지")).toBeInTheDocument();
    expect(screen.getByText(/중간에 나갔다가 다시 오는 경우는 따로 챙겨 주세요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /칸마다 고르기/ }));
    expect(sample.getByText("참석할 프로그램과 식사를 선택해주세요")).toBeInTheDocument();
    expect(sample.getByText("외 4칸")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /도착~출발만 받기/ }));
    fireEvent.click(screen.getByRole("button", { name: "질문 만들기" }));

    const list = await questionList();
    expect(await list.findByText("수련회장에 언제 도착하나요?")).toBeInTheDocument();
    expect(list.queryByText("숙박하는 밤을 모두 골라주세요")).not.toBeInTheDocument();
    const sent = operatorRequests.findLast((request) => request.method === "PUT" && request.url.endsWith("/setup"));
    expect(sent?.body).toMatchObject({ attendance: { partial: true, worshipOnly: false, mode: "RANGE" } });

    // Preview: chips by day, a reversed range is caught on 출발, and the covered slots are listed.
    const preview = within(screen.getByRole("region", { name: "참가자 화면 미리보기" }));
    fireEvent.click(preview.getByRole("radio", { name: "부분 참석" }));
    expect(preview.getAllByText("1월 23일 (토)").length).toBeGreaterThan(0);
    fireEvent.click(preview.getByRole("radio", { name: "1월 23일 (토) 점심부터" }));
    // 출발 lists only the slots from the arrival on (#328), so a reversed range cannot be picked here.
    expect(preview.queryByRole("radio", { name: "1월 22일 (금) 집회까지" })).not.toBeInTheDocument();
    expect(preview.getByText("도착보다 앞선 칸은 빼고 보여 드려요.")).toBeInTheDocument();
    expect(preview.queryByText("이 일정에 포함돼요")).not.toBeInTheDocument();
    fireEvent.click(preview.getByRole("radio", { name: "1월 24일 (일) 아침까지" }));
    expect(preview.queryByText(/출발은 도착보다 앞일 수 없어요/)).not.toBeInTheDocument();
    const covered = within(preview.getByRole("status"));
    expect(covered.getByText("이 일정에 포함돼요")).toBeInTheDocument();
    expect(covered.getByText("점심 · 저녁 · 집회")).toBeInTheDocument();
    expect(covered.getByText("아침")).toBeInTheDocument();

    // An application arrived after this page loaded: the server refuses the other mode.
    server.use(
      http.put("/api/v1/operator/events/:eventId/forms/:formId/setup", () => problem(409, "FIELD_LOCKED", { detail: "hidden" })),
    );
    fireEvent.click(screen.getByRole("radio", { name: /칸마다 고르기/ }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(await screen.findByText(/부분 참석을 받는 방식을 바꿀 수 없어요/)).toBeInTheDocument();
  });

  it("shows vehicles by arrival and departure from a new card, previews it, and locks it (#328)", async () => {
    await login({ userId: localUsers[0].userId });
    const retreat = await createEvent(localSpace.spaceId, {
      name: "차량 수련회",
      startDate: "2027-01-22",
      endDate: "2027-01-24",
    });
    const created = await createForm(retreat.eventId);
    renderSetup(retreat.eventId);
    const timing = await screen.findByRole("checkbox", { name: /도착·출발 시점에 맞는 차량만 보여 주기/ }, { timeout: 4000 });
    expect(timing).toBeChecked();
    const sample = within(screen.getByLabelText("부분 참석자에게 보이는 가는 길 보기"));
    expect(sample.getByText("1월 22일 (금) 저녁부터 오면")).toBeInTheDocument();
    expect(sample.getByText("1월 23일 (토) 아침부터 오면")).toBeInTheDocument();
    expect(sample.getAllByText("단체 이동 차량")).toHaveLength(1);

    // Without partial attendance the switch means nothing.
    fireEvent.click(screen.getByRole("checkbox", { name: /부분 참석 받기/ }));
    expect(timing).toBeDisabled();
    expect(screen.getByText("부분 참석을 받을 때만 쓸 수 있어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /부분 참석 받기/ }));
    expect(timing).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "질문 만들기" }));
    await (await questionList()).findByText("수련회장에 언제 도착하나요?");
    const sent = operatorRequests.filter((request) => request.method === "PUT" && request.url.endsWith("/setup")).at(-1);
    expect(sent?.body).toMatchObject({ transport: { partialByTime: true } });

    // The preview follows the arrival slot and says why the bus is gone.
    const preview = within(screen.getByRole("region", { name: "참가자 화면 미리보기" }));
    fireEvent.click(preview.getByRole("radio", { name: "부분 참석" }));
    fireEvent.click(preview.getByRole("radio", { name: "1월 22일 (금) 저녁부터" }));
    expect(preview.getByRole("radio", { name: "단체 이동 차량" })).toBeInTheDocument();
    fireEvent.click(preview.getByRole("radio", { name: "1월 23일 (토) 점심부터" }));
    expect(preview.queryByRole("radio", { name: "단체 이동 차량" })).not.toBeInTheDocument();
    expect(preview.getByText(/첫 일정부터 오는 분만 단체 이동 차량을 탈 수 있어요/)).toBeInTheDocument();
    expect(preview.getByRole("radio", { name: "자차 합승 (다른 사람 차를 타요)" })).toBeInTheDocument();

    markSubmitted(retreat.eventId, created.formId);
    cleanup();
    renderSetup(retreat.eventId);
    expect(
      await screen.findByRole("checkbox", { name: /도착·출발 시점에 맞는 차량만 보여 주기/ }, { timeout: 4000 }),
    ).toBeDisabled();
    expect(screen.getByText(/켜 둔 동안에는 부분 참석 받기와 첫·마지막·집회 칸도 바꿀 수 없어요/)).toBeInTheDocument();
    server.use(
      http.put("/api/v1/operator/events/:eventId/forms/:formId/setup", () => problem(409, "FIELD_LOCKED", { detail: "hidden" })),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "1일차 저녁" }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(await screen.findByText(/부분 참석 받기와 첫·마지막·집회 칸은 바꿀 수 없어요/)).toBeInTheDocument();
  });

  it("keeps the attendance mode once applications are in, and explains a refused change", async () => {
    await login({ userId: localUsers[0].userId });
    const retreat = await createEvent(localSpace.spaceId, {
      name: "잠긴 수련회",
      startDate: "2027-01-22",
      endDate: "2027-01-24",
    });
    const created = await createForm(retreat.eventId);
    renderSetup(retreat.eventId);
    fireEvent.click(await screen.findByRole("button", { name: "질문 만들기" }, { timeout: 4000 }));
    await (await questionList()).findByText("수련회장에 언제 도착하나요?");
    markSubmitted(retreat.eventId, created.formId);
    cleanup();
    renderSetup(retreat.eventId);
    expect(await screen.findByRole("radio", { name: /칸마다 고르기/ }, { timeout: 4000 })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /도착~출발만 받기/ })).toBeChecked();
    expect(screen.getByText(/신청이 들어온 신청서라 방식을 바꿀 수 없어요/)).toBeInTheDocument();

    // A page opened before the first application still sends the old choice: the 409 is explained.
    server.use(
      http.put("/api/v1/operator/events/:eventId/forms/:formId/setup", () => problem(409, "FIELD_LOCKED", { detail: "hidden" })),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /성별/ }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(await screen.findByText(/이미 받은 질문의 표시 조건이 바뀌는 설정은 저장할 수 없어요/)).toBeInTheDocument();
  });

  it("lists middle groups as a dropdown with 새가족 (등반X) and hides the cell for a newcomer", async () => {
    await login({ userId: localUsers[0].userId });
    const retreat = await createEvent(localSpace.spaceId, {
      name: "새가족 수련회",
      startDate: "2027-01-22",
      endDate: "2027-01-24",
    });
    renderSetup(retreat.eventId);
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));

    // There is no separate 새가족 switch any more.
    await screen.findByRole("checkbox", { name: /중그룹/ });
    expect(screen.queryByRole("checkbox", { name: /새가족/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /중그룹/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^셀/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /중그룹 목록/ }), { target: { value: "1중그룹\n2중그룹\n" } });
    expect(screen.getByText(/새가족으로 분류되고 셀은 묻지 않아요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "질문 만들기" }));

    const list = await questionList();
    expect(await list.findByText("중그룹")).toBeInTheDocument();
    const sent = operatorRequests.filter((request) => request.method === "PUT" && request.url.endsWith("/setup"));
    expect(sent.at(-1)?.body).toMatchObject({ middleGroups: ["1중그룹", "2중그룹", ""], cells: [] });
    expect(sent.at(-1)?.body).not.toHaveProperty("newcomer");
    const preview = within(screen.getByRole("region", { name: "참가자 화면 미리보기" }));
    const middle = await preview.findByRole("combobox", { name: /중그룹/ });
    expect(within(middle).getByRole("option", { name: "새가족 (등반X)" })).toBeInTheDocument();
    // The cell is asked only after a listed middle group.
    expect(preview.queryByRole("textbox", { name: /^셀/ })).not.toBeInTheDocument();
    fireEvent.change(middle, { target: { value: within(middle).getByRole("option", { name: "1중그룹" }).getAttribute("value") } });
    expect(await preview.findByRole("textbox", { name: /^셀/ })).toBeInTheDocument();
    fireEvent.change(middle, { target: { value: "opt_newcomer" } });
    await waitFor(() => expect(preview.queryByRole("textbox", { name: /^셀/ })).not.toBeInTheDocument());
  });

  it("asks commuters to skip lodging by default in a new RANGE setup and can turn it off", async () => {
    await login({ userId: localUsers[0].userId });
    const retreat = await createEvent(localSpace.spaceId, {
      name: "통근 수련회",
      startDate: "2027-01-22",
      endDate: "2027-01-24",
    });
    renderSetup(retreat.eventId);
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));

    const commute = await screen.findByRole("checkbox", { name: /통근자 숙박 제외 받기/ });
    expect(commute).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "질문 만들기" }));
    const preview = within(await screen.findByRole("region", { name: "참가자 화면 미리보기" }));
    const puts = () => operatorRequests.filter((request) => request.method === "PUT" && request.url.endsWith("/setup"));
    await waitFor(() => expect(puts().at(-1)?.body).toMatchObject({ attendance: { mode: "RANGE", noLodging: true } }));
    fireEvent.click(preview.getByRole("radio", { name: "전체 참석" }));
    expect(await preview.findByRole("checkbox", { name: "수련회장에서 숙박하지 않아요" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /통근자 숙박 제외 받기/ }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    await waitFor(() => expect(puts().at(-1)?.body).toMatchObject({ attendance: { noLodging: false } }));
    await waitFor(() =>
      expect(preview.queryByRole("checkbox", { name: "수련회장에서 숙박하지 않아요" })).not.toBeInTheDocument(),
    );
  });

  it("rewords and moves base questions and turns 또래 off", async () => {
    await login({ userId: localUsers[0].userId });
    renderSetup();
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    const list = await questionList();
    expect(await list.findByText("또래")).toBeInTheDocument();
    expect(list.queryByRole("button", { name: "이름 끄기" })).not.toBeInTheDocument();
    expect(list.queryByRole("button", { name: "이름 삭제" })).not.toBeInTheDocument();

    fireEvent.click(list.getByRole("button", { name: "전화 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "질문" }), { target: { value: "연락처" } });
    fireEvent.change(screen.getByRole("textbox", { name: "안내 문구 (선택)" }), { target: { value: "010-0000-0000" } });
    fireEvent.click(screen.getByRole("button", { name: "문구 저장" }));
    expect(await list.findByText("연락처")).toBeInTheDocument();
    const patched = operatorRequests.filter((request) => request.method === "PATCH" && request.url.includes("/fields/"));
    expect(patched.at(-1)?.body).toEqual({
      label: "연락처",
      description: null,
      config: { placeholder: "010-0000-0000" },
    });
    const preview = within(screen.getByRole("region", { name: "참가자 화면 미리보기" }));
    expect(preview.getByPlaceholderText("010-0000-0000")).toBeInTheDocument();

    fireEvent.click(list.getByRole("button", { name: "또래 위로" }));
    await waitFor(() => {
      const order = operatorRequests.filter((request) => request.method === "PUT" && request.url.endsWith("/order"));
      expect(order).toHaveLength(1);
    });
    await waitFor(() => expect(list.getAllByText("기본 항목")[1].previousSibling).toHaveTextContent("또래"));

    fireEvent.click(list.getByRole("button", { name: "또래 끄기" }));
    expect(await list.findByText("꺼짐")).toBeInTheDocument();
    expect(preview.queryByPlaceholderText("예: 94")).not.toBeInTheDocument();
    fireEvent.click(list.getByRole("button", { name: "또래 켜기" }));
    await waitFor(() => expect(preview.getByPlaceholderText("예: 94")).toBeInTheDocument());
  });
  it("turns 또래 off from the setup card without resetting the card or blocking the page", async () => {
    await login({ userId: localUsers[0].userId });
    const retreat = await createEvent(localSpace.spaceId, {
      name: "겨울 수련회",
      startDate: "2027-01-22",
      endDate: "2027-01-23",
    });
    renderSetup(retreat.eventId);
    fireEvent.click(await screen.findByRole("button", { name: "신청서 만들기" }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: "질문 만들기" }));
    const list = await questionList();
    expect(await list.findByText("성별")).toBeInTheDocument();

    // An unsaved choice on the card, then the 또래 switch.
    fireEvent.click(screen.getByRole("checkbox", { name: "중그룹" }));
    const cohort = screen.getByRole("checkbox", { name: /^또래/ });
    fireEvent.click(cohort);
    // Nothing goes into a loading or disabled state while the switch saves.
    expect(cohort).toBeEnabled();
    expect(screen.getByRole("button", { name: "신청 열기" })).toBeEnabled();
    expect(list.getByRole("button", { name: "성별 수정" })).toBeEnabled();
    await waitFor(() => expect(cohort).not.toBeChecked());
    expect(await list.findByText("꺼짐")).toBeInTheDocument();
    await waitFor(() => {
      const patched = operatorRequests.filter((request) => request.method === "PATCH" && request.url.includes("/fields/"));
      expect(patched.at(-1)?.body).toEqual({ hidden: true });
    });
    // The server answered with a new form; the unsaved card choice is still there.
    expect(screen.getByRole("checkbox", { name: "중그룹" })).toBeChecked();
    expect(screen.getByRole("button", { name: "설정 저장" })).toBeEnabled();
  });
});
