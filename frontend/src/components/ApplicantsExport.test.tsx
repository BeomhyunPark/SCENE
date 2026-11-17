import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { operatorRequests, setLifecycle } from "../mocks/operatorStore";
import { submitPublicApplication } from "../mocks/participantStore";
import { server } from "../mocks/server";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const MANAGER = localUsers[1].userId;
const EXPORT_PATH = `/api/v1/operator/events/${EVENT}/applications/export`;

let saved: Blob[] = [];

beforeEach(() => {
  saved = [];
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      saved.push(blob);
      return "blob:applicants";
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function seedApplicants() {
  const form = createForm(EVENT, OWNER, { customLabel: "메모" });
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  const texts: Record<string, string>[] = [
    { 이름: "김하나", 전화: "010-1111-2222", 또래: "94", 메모: "=1+2" },
    { 이름: "박둘", 전화: "010-3333-4444", 또래: "95", 메모: '쉼표, "따옴표"\n줄바꿈' },
  ];
  for (const text of texts) {
    const answers = form.fields
      .filter((field) => text[field.label] !== undefined)
      .map((field) => ({ fieldId: field.fieldId, text: text[field.label] }));
    const submitted = submitPublicApplication(EVENT, form.formId, { answers });
    if ("code" in submitted) throw new Error(submitted.code);
  }
}

function openApp() {
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/participants`]}>
      <App />
    </MemoryRouter>,
  );
}

function exportRequests() {
  return operatorRequests.filter((request) => request.method === "POST" && request.url === EXPORT_PATH);
}

describe("applicant CSV download", () => {
  it("asks once about personal data, then saves the CSV", async () => {
    seedApplicants();
    await login({ userId: OWNER });
    openApp();

    const button = await screen.findByRole("button", { name: "CSV 내려받기" });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    const dialog = await screen.findByRole("dialog", { name: "신청자 명단을 내려받을까요?" });
    expect(dialog).toHaveTextContent("2명");
    expect(dialog).toHaveTextContent("전화번호");
    expect(exportRequests()).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "내려받기" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    // The dialog closes in the same state update as the save; the larger table re-renders after it.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(exportRequests()).toHaveLength(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    const bytes = new Uint8Array(await saved[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes.slice(3));
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("제출 시각,이름,전화,또래,메모");
    expect(lines[1]).toMatch(/^\d{4}\. \d{1,2}\. \d{1,2}\. \d{2}:\d{2},김하나,010-1111-2222,94,'=1\+2$/);
    expect(text).toContain('박둘,010-3333-4444,95,"쉼표, ""따옴표""\n줄바꿈"');
  });

  it("closes the confirmation without downloading", async () => {
    seedApplicants();
    await login({ userId: OWNER });
    openApp();

    fireEvent.click(await screen.findByRole("button", { name: "CSV 내려받기" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exportRequests()).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });

  it("is hidden from an operator with read access only", async () => {
    seedApplicants();
    await login({ userId: MANAGER });
    openApp();

    expect(await screen.findByRole("region", { name: "신청자" })).toBeInTheDocument();
    await waitFor(() =>
      expect(operatorRequests.some((request) => request.url.includes(`/operators/${MANAGER}/permissions`))).toBe(true),
    );
    expect(screen.queryByRole("button", { name: "CSV 내려받기" })).not.toBeInTheDocument();
  });

  it("is disabled with no applicants", async () => {
    await login({ userId: OWNER });
    openApp();

    expect(await screen.findByRole("heading", { name: "아직 참가자가 없어요." })).toBeInTheDocument();
    const button = await screen.findByRole("button", { name: "CSV 내려받기" });
    expect(button).toBeDisabled();
    expect(screen.getByText("신청이 들어오면 내려받을 수 있어요.")).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exportRequests()).toHaveLength(0);
  });

  it("says so when the download fails", async () => {
    seedApplicants();
    server.use(http.post("/api/v1/operator/events/:eventId/applications/export", () => HttpResponse.json({}, { status: 500 })));
    await login({ userId: OWNER });
    openApp();

    fireEvent.click(await screen.findByRole("button", { name: "CSV 내려받기" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "내려받기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("내려받지 못했어요.");
    expect(saved).toHaveLength(0);
  });

  it("says so when the permission is gone on the server", async () => {
    seedApplicants();
    server.use(
      http.post("/api/v1/operator/events/:eventId/applications/export", () =>
        HttpResponse.json({ code: "FORBIDDEN", status: 403 }, { status: 403, headers: { "Content-Type": "application/problem+json" } }),
      ),
    );
    await login({ userId: OWNER });
    openApp();

    fireEvent.click(await screen.findByRole("button", { name: "CSV 내려받기" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "내려받기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("내려받을 권한이 없어요.");
    expect(saved).toHaveLength(0);
  });
});
