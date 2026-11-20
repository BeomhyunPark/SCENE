import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { revokePermissions } from "../mocks/taskStore";
import { setLifecycle } from "../mocks/operatorStore";
import { saveRetrospectiveText } from "../mocks/retrospectiveStore";
import { server } from "../mocks/server";
import { unverifiedRegistry } from "../mocks/unverified";

const EVENT = localEvent.eventId;
const LABEL = "이 행사를 마치고 남길 내용을 적어 주세요.";

async function openAs(userIndex: number, status: "DRAFT" | "ACTIVE" | "ENDED" | "ARCHIVED") {
  setLifecycle(EVENT, status, 4);
  await login({ userId: localUsers[userIndex].userId });
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/retrospective`]}>
      <App />
    </MemoryRouter>,
  );
}

describe("event retrospective", () => {
  it("saves on an ended event and shows who saved it", async () => {
    await openAs(0, "ENDED");
    const box = await screen.findByLabelText(LABEL, {}, { timeout: 4000 });
    expect(box).toHaveValue("");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    fireEvent.change(box, { target: { value: "잘 마쳤어요" } });
    expect(screen.getByText("6 / 10,000자")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("status")).toHaveTextContent("저장했어요.");
    expect(screen.getByLabelText(LABEL)).toHaveValue("잘 마쳤어요");
    expect(screen.getByText(/Local owner 저장/)).toBeInTheDocument();
    expect(unverifiedRegistry().some((entry) => entry.path.endsWith("/retrospective"))).toBe(false);
  });

  it("keeps the draft on a version conflict until the latest text is loaded", async () => {
    await openAs(0, "ENDED");
    const box = await screen.findByLabelText(LABEL, {}, { timeout: 4000 });
    saveRetrospectiveText(EVENT, "다른 운영자의 회고");
    fireEvent.change(box, { target: { value: "내 회고" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("다른 운영자가 먼저 저장했어요.");
    expect(screen.getByLabelText(LABEL)).toHaveValue("내 회고");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "최신 내용 불러오기" }));
    expect(await screen.findByDisplayValue("다른 운영자의 회고")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reads an archived retrospective without a save button", async () => {
    saveRetrospectiveText(EVENT, "지난 회고");
    await openAs(0, "ARCHIVED");
    expect(await screen.findByText("지난 회고", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });

  it("does not let a reopened event write a retrospective", async () => {
    await openAs(0, "ACTIVE");
    expect(await screen.findByText("다시 연 행사에는 새 회고를 쓸 수 없어요.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });

  it("shows an ended retrospective read only to an operator without EVENT_UPDATE", async () => {
    saveRetrospectiveText(EVENT, "OWNER가 쓴 회고");
    // MANAGER holds EVENT_UPDATE by default (DEC-079 Follow-up 2026-11-20); this one has a REVOKE.
    revokePermissions(EVENT, localUsers[1].userId, ["EVENT_UPDATE"]);
    await openAs(1, "ENDED");
    expect(await screen.findByText("OWNER가 쓴 회고", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();
  });

  it("says the event state blocks the save when the server refuses it", async () => {
    server.use(
      http.put("/api/v1/operator/events/:eventId/retrospective", () =>
        HttpResponse.json(
          { type: "about:blank", title: "x", status: 409, detail: "hidden-detail", code: "EVENT_ARCHIVED" },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    await openAs(0, "ENDED");
    fireEvent.change(await screen.findByLabelText(LABEL, {}, { timeout: 4000 }), { target: { value: "늦은 회고" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("지금 행사 상태에서는 회고를 저장할 수 없어요.");
    expect(screen.queryByText("hidden-detail")).not.toBeInTheDocument();
  });
});
