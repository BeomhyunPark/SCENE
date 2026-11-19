import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests, setLifecycle } from "../mocks/operatorStore";
import { grantPermissions, permissionsFor } from "../mocks/taskStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const MANAGER = localUsers[1].userId;
const STAFF = localUsers[2].userId;
const STAFF_PERMISSIONS = `/api/v1/operator/events/${EVENT}/operators/${STAFF}/permissions`;

function openApp() {
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/operators`]}>
      <App />
    </MemoryRouter>,
  );
}

async function operatorsRegion() {
  const region = await screen.findByRole("region", { name: "운영자" });
  await within(region).findByText("Local staff");
  return region;
}

function rowOf(region: HTMLElement, name: string) {
  const row = within(region).getByText(name).closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("event owner edits an operator's permissions (DEC-079, #395)", () => {
  it("shows role defaults apart from personal changes and offers no editor on owner rows", async () => {
    grantPermissions(EVENT, STAFF, ["DATA_EXPORT"]);
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    expect(await within(rowOf(region, "Local staff")).findByText("개별 권한 1개 더함")).toBeInTheDocument();
    expect(await within(rowOf(region, "Local manager")).findByText("역할 기본 권한")).toBeInTheDocument();
    expect(within(rowOf(region, "Local owner")).queryByRole("button", { name: /권한/ })).not.toBeInTheDocument();

    fireEvent.click(within(region).getByRole("button", { name: "Local staff 권한" }));
    const dialog = await screen.findByRole("dialog", { name: "Local staff님의 권한" });
    const checkIn = await within(dialog).findByRole("checkbox", { name: "체크인" });
    expect(checkIn).toBeChecked();
    expect(checkIn.closest("div")).toHaveTextContent("역할 기본");
    const exportKey = within(dialog).getByRole("checkbox", { name: "명단 내려받기" });
    expect(exportKey).toBeChecked();
    expect(exportKey.closest("div")).toHaveTextContent("개별로 더함");
    expect(within(dialog).getByRole("checkbox", { name: "조 편성" })).not.toBeChecked();
    expect(within(dialog).queryByRole("checkbox", { name: /행사 보기|운영 멤버/ })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("행사 보기는 항상 켜져 있어요");
  });

  it("MANAGER defaults include schedule and notice writes", async () => {
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(within(region).getByRole("button", { name: "Local manager 권한" }));
    const dialog = await screen.findByRole("dialog", { name: "Local manager님의 권한" });
    expect(await within(dialog).findByRole("checkbox", { name: "일정 쓰기" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "공지 쓰기" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "조 편성" })).not.toBeChecked();
  });

  it("grants group writes to STAFF and revokes a default, keeping the stored override of an unlisted key", async () => {
    grantPermissions(EVENT, STAFF, ["FINANCE_READ"]);
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(within(region).getByRole("button", { name: "Local staff 권한" }));
    const dialog = await screen.findByRole("dialog", { name: "Local staff님의 권한" });
    const save = within(dialog).getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: "조 편성" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "체크인" }));
    expect(within(dialog).getByRole("checkbox", { name: "체크인" }).closest("div")).toHaveTextContent("개별로 뺌");
    fireEvent.click(save);

    expect(await within(region).findByRole("status")).toHaveTextContent("Local staff님의 권한을 저장했어요.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(operatorRequests.find((request) => request.method === "PUT")).toEqual({
      method: "PUT",
      url: STAFF_PERMISSIONS,
      body: { grants: ["FINANCE_READ", "GROUP_WRITE"], revokes: ["CHECKIN_WRITE"] },
    });
    const after = permissionsFor(EVENT, OWNER, STAFF);
    if ("code" in after) throw new Error(after.code);
    expect(after.effective).toContain("GROUP_WRITE");
    expect(after.effective).not.toContain("CHECKIN_WRITE");
    await waitFor(() => expect(rowOf(region, "Local staff")).toHaveTextContent("개별 권한 1개 더함 · 1개 뺌"));
  });

  it("allows only turning off in an archived event", async () => {
    setLifecycle(EVENT, "ARCHIVED", 1);
    grantPermissions(EVENT, STAFF, ["DATA_EXPORT"]);
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff 권한" }));
    const dialog = await screen.findByRole("dialog", { name: "Local staff님의 권한" });
    expect(await within(dialog).findByRole("checkbox", { name: "조 편성" })).toBeDisabled();
    const exportKey = within(dialog).getByRole("checkbox", { name: "명단 내려받기" });
    expect(exportKey).toBeEnabled();
    fireEvent.click(exportKey);
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(await within(region).findByRole("status")).toHaveTextContent("저장했어요");
  });

  it("hides the editor from a non-owner", async () => {
    await login({ userId: MANAGER });
    openApp();

    const region = await operatorsRegion();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "외부 협력자 초대" })).not.toBeInTheDocument());
    expect(within(region).queryByRole("button", { name: /권한/ })).not.toBeInTheDocument();
  });
});
