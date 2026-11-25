import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { ApplicationDetail } from "../api/applications";
import { badgeText } from "../api/operatorNotifications";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { notifyOperators } from "../mocks/notificationStore";
import { setLifecycle } from "../mocks/operatorStore";
import { reviseApplication, submitPublicApplication } from "../mocks/participantStore";
import { revokePermissions } from "../mocks/taskStore";
import { notificationHref } from "./notificationHref";
import { revisionDiff } from "./revisionDiff";
import { MAX_DELAY_MS, nextDelayMs } from "./useOperatorUpdates";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 3000 };

function seedForm() {
  const form = createForm(EVENT, OWNER, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  const name = form.fields.find((field) => field.label === "이름")!;
  const phone = form.fields.find((field) => field.label === "전화")!;
  const submitted = submitPublicApplication(EVENT, form.formId, {
    answers: [
      { fieldId: name.fieldId, text: "김하나" },
      { fieldId: phone.fieldId, text: "010-1111-0000" },
    ],
    pin: "730914",
  });
  if ("code" in submitted) throw new Error(submitted.code);
  return { applicationId: submitted.applicationId, nameId: name.fieldId, phoneId: phone.fieldId };
}

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("polling and badge helpers (#436)", () => {
  it("waits pollAfterSeconds ±20%, doubles per failure and stops at 300s", () => {
    expect(nextDelayMs(15, 0, () => 0)).toBe(12_000);
    expect(nextDelayMs(15, 0, () => 1)).toBe(18_000);
    expect(nextDelayMs(15, 1, () => 0.5)).toBe(30_000);
    expect(nextDelayMs(15, 20, () => 0.5)).toBe(MAX_DELAY_MS);
  });

  it("shows 99+ above 99 and nothing at 0", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(7)).toBe("7");
    expect(badgeText(100)).toBe("99+");
  });

  it("opens applications, the event and staff notices, and leaves unknown kinds closed", () => {
    const base = { notificationId: "n", seq: 1, title: "t", body: null, important: false, count: 1, createdAt: "", readAt: null };
    expect(notificationHref("e", { ...base, kind: "APPLICATION_REVISED", target: { type: "APPLICATION", id: "a" } })).toBe(
      "/events/e/participants/a",
    );
    expect(notificationHref("e", { ...base, kind: "LIFECYCLE_OVERRIDE", target: { type: "EVENT", id: "e" } })).toBe("/events/e");
    expect(notificationHref("e", { ...base, kind: "STAFF_NOTICE_PUBLISHED", target: { type: "NOTICE", id: "x" } })).toBe("/events/e/notices/x");
    expect(notificationHref("e", { ...base, kind: "STAFF_NOTICE_UPDATED", target: { type: "NOTICE", id: "x" } })).toBe("/events/e/notices/x");
    expect(notificationHref("e", { ...base, kind: "SOMETHING_NEW", target: { type: "APPLICATION", id: "a" } })).toBeNull();
  });

  it("diffs only the changed questions and keeps a withheld phone withheld on both sides", () => {
    const answer = (fieldId: string, text: string | null) => ({
      fieldId,
      kind: "CUSTOM" as const,
      systemKey: null,
      label: fieldId,
      position: 0,
      answerType: "SHORT_TEXT" as const,
      hidden: false,
      config: {},
      value: text === null ? {} : { text },
      contact: text === null,
      withheld: text === null,
    });
    const detail = (answers: ReturnType<typeof answer>[]) => ({ answers }) as unknown as ApplicationDetail;
    const lines = revisionDiff(
      [
        { key: "FIELD", fieldId: "bus", label: "이동 수단" },
        { key: "FIELD", fieldId: "phone", label: "전화" },
        { key: "FIELD", fieldId: "new", label: "새 질문" },
      ],
      detail([answer("bus", "버스"), answer("phone", null)]),
      detail([answer("bus", "자가용"), answer("phone", null), answer("new", "예")]),
    );
    expect(lines.map((line) => [line.label, line.before, line.after])).toEqual([
      ["이동 수단", "버스", "자가용"],
      ["전화", expect.stringContaining("권한"), expect.stringContaining("권한")],
      ["새 질문", "응답 없음", "예"],
    ]);
  });
});

describe("운영자 알림 (#436)", () => {
  it("lists merged edits, opens the application, marks it read and clears the badge", async () => {
    const seeded = seedForm();
    const second = reviseApplication(EVENT, seeded.applicationId, { [seeded.nameId]: { text: "김하나둘" } })!;
    const current = reviseApplication(EVENT, second, { [seeded.nameId]: { text: "김셋" } });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/notifications`);

    const list = await screen.findByRole("list", { name: "알림 목록" }, WAIT);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("김셋님이 신청 내역을 수정했어요");
    expect(items[0]).toHaveTextContent("2번");
    expect(items[0]).toHaveTextContent("이름");
    expect(items[0]).not.toHaveTextContent("010");
    // Badge in the sidebar and the phone bar.
    await waitFor(() => expect(screen.getAllByLabelText("읽지 않은 알림 1개").length).toBeGreaterThan(0), WAIT);

    fireEvent.click(within(items[0]).getByRole("link"));
    expect(await screen.findByRole("heading", { name: "변경 이력" }, WAIT)).toBeInTheDocument();
    expect(current).not.toBe(second);
    // Both edits are in the history; the change of the last one shows before → after.
    fireEvent.click(screen.getAllByRole("button", { name: "변경 전후 보기" })[0]);
    expect(await screen.findByLabelText("3번째 변경 전후", {}, WAIT)).toHaveTextContent(/김하나둘.*김셋/);
    await waitFor(() => expect(screen.queryAllByLabelText("읽지 않은 알림 1개")).toHaveLength(0), WAIT);
  });

  it("shows an unknown kind as plain text and 모두 읽음 reads everything", async () => {
    seedForm();
    notifyOperators(EVENT, [OWNER], { kind: "STAFF_NOTICE_PUBLISHED", target: { type: "NOTICE", id: "n1" }, title: "운영진 공지", body: "7시 모임" });
    notifyOperators(EVENT, [OWNER], { kind: "FUTURE_KIND", target: { type: "THING", id: "x" }, title: "새 종류", body: null });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/notifications`);

    const list = await screen.findByRole("list", { name: "알림 목록" }, WAIT);
    // The staff notice opens the notice (D3); the unknown kind stays plain text.
    expect(within(list).queryAllByRole("link")).toHaveLength(1);
    expect(within(list).getByText("운영진 공지")).toBeInTheDocument();
    expect(within(list).getByText("새 종류")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "모두 읽음" })).toBeDisabled(), WAIT);
  });

  it("gives an operator without PARTICIPANT_READ no application notification", async () => {
    const seeded = seedForm();
    revokePermissions(EVENT, OWNER, ["PARTICIPANT_READ"]);
    reviseApplication(EVENT, seeded.applicationId, { [seeded.nameId]: { text: "김하나둘" } });
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/notifications`);
    expect(await screen.findByText(/아직 알림이 없어요/, {}, WAIT)).toBeInTheDocument();
  });

  it("raises the badge on the next check while the page stays open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const seeded = seedForm();
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}`);
    await screen.findAllByRole("link", { name: /알림/ }, WAIT);
    expect(screen.queryAllByLabelText(/읽지 않은 알림/)).toHaveLength(0);

    reviseApplication(EVENT, seeded.applicationId, { [seeded.nameId]: { text: "김하나둘" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000);
    });
    await waitFor(() => expect(screen.getAllByLabelText("읽지 않은 알림 1개").length).toBeGreaterThan(0), WAIT);
  });

  it("keeps the organization 알림 page as a pointer into events, without a badge", async () => {
    await login({ userId: OWNER });
    openApp("/notifications");
    expect(await screen.findByRole("heading", { name: "알림은 행사 안에서 봐요" }, WAIT)).toBeInTheDocument();
    expect(screen.queryAllByLabelText(/읽지 않은 알림/)).toHaveLength(0);
  });
});
