import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests, setLifecycle } from "../mocks/operatorStore";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { createTask, permissionsFor, revokePermissions, taskDetail } from "../mocks/taskStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const MANAGER = localUsers[1].userId;
const STAFF = localUsers[2].userId;
const STAFF_PATH = `/api/v1/operator/events/${EVENT}/operators/${STAFF}`;

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

describe("event owner changes operator roles and removes operators (#371)", () => {
  it("offers role change and removal only on non-owner rows", async () => {
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    expect(await within(region).findByRole("button", { name: "Local staff Manager로 변경" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Local staff 빼기" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Local manager Staff로 변경" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Local manager 빼기" })).toBeInTheDocument();
    expect(within(rowOf(region, "Local owner")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides the controls from a non-owner", async () => {
    await login({ userId: MANAGER });
    openApp();

    const region = await operatorsRegion();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "외부 협력자 초대" })).not.toBeInTheDocument());
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
  });

  it("changes STAFF to MANAGER after a confirmation that resets individual permissions", async () => {
    revokePermissions(EVENT, STAFF, ["CHECKIN_WRITE"]);
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff Manager로 변경" }));
    const dialog = await screen.findByRole("dialog", { name: "Local staff님을 Manager로 바꿀까요?" });
    expect(dialog).toHaveTextContent("개별 권한은 모두 초기화되고");
    expect(operatorRequests.some((request) => request.method === "PATCH")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "역할 바꾸기" }));

    expect(await within(region).findByRole("status")).toHaveTextContent("Local staff님의 역할을 Manager로 바꿨어요.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(rowOf(region, "Local staff")).toHaveTextContent("Manager");
    expect(within(region).getByRole("button", { name: "Local staff Staff로 변경" })).toBeInTheDocument();
    expect(operatorRequests.find((request) => request.method === "PATCH")).toEqual({
      method: "PATCH",
      url: STAFF_PATH,
      body: { role: "MANAGER" },
    });
    const permissions = permissionsFor(EVENT, OWNER, STAFF);
    if ("code" in permissions) throw new Error(permissions.code);
    expect(permissions.overrides.revokes).toEqual([]);
    expect(permissions.effective).toContain("CHECKIN_WRITE");
  });

  it("changes nothing when the confirmation is dismissed", async () => {
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local manager Staff로 변경" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(rowOf(region, "Local manager")).toHaveTextContent("Manager");
    expect(operatorRequests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("removes an operator after a confirmation and clears their task assignee", async () => {
    const task = createTask(EVENT, OWNER, { title: "명찰 준비", assigneeUserId: STAFF });
    if ("code" in task) throw new Error(task.code);
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    expect(within(region).getByText("3명")).toBeInTheDocument();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff 빼기" }));
    const dialog = await screen.findByRole("dialog", { name: "Local staff님을 행사에서 뺄까요?" });
    expect(dialog).toHaveTextContent("담당하던 업무는 담당자가 비워지고");

    fireEvent.click(within(dialog).getByRole("button", { name: "빼기" }));

    expect(await within(region).findByRole("status")).toHaveTextContent("Local staff님을 행사 운영자에서 뺐어요.");
    expect(within(region).queryByText("Local staff")).not.toBeInTheDocument();
    expect(within(region).getByText("2명")).toBeInTheDocument();
    expect(operatorRequests.some((request) => request.method === "DELETE" && request.url === STAFF_PATH)).toBe(true);
    const after = taskDetail(EVENT, task.taskId, OWNER);
    if ("code" in after) throw new Error(after.code);
    expect(after.assigneeUserId).toBeNull();
  });

  it("explains an operator who is already gone and reloads the list", async () => {
    server.use(http.delete(STAFF_PATH, () => problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" })));
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff 빼기" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "빼기" }));

    expect(await within(region).findByRole("alert")).toHaveTextContent(
      "Local staff님은 이미 이 행사의 운영자가 아니에요. 목록을 새로 불러왔어요.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains a forbidden role change", async () => {
    server.use(http.patch(STAFF_PATH, () => problem(403, "FORBIDDEN", { detail: "hidden" })));
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff Manager로 변경" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "역할 바꾸기" }));

    expect(await within(region).findByRole("alert")).toHaveTextContent("운영자 역할을 바꿀 권한이 없어요.");
    expect(rowOf(region, "Local staff")).toHaveTextContent("Staff");
  });

  it("explains a forbidden removal", async () => {
    server.use(http.delete(STAFF_PATH, () => problem(403, "FORBIDDEN", { detail: "hidden" })));
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff 빼기" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "빼기" }));

    expect(await within(region).findByRole("alert")).toHaveTextContent("운영자를 뺄 권한이 없어요.");
    expect(within(region).getByText("Local staff")).toBeInTheDocument();
  });

  it("explains an event archived after the screen loaded", async () => {
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff Manager로 변경" }));
    setLifecycle(EVENT, "ARCHIVED", 3);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "역할 바꾸기" }));

    expect(await within(region).findByRole("alert")).toHaveTextContent("보관된 행사에서는 운영자 역할을 바꿀 수 없어요.");
    expect(rowOf(region, "Local staff")).toHaveTextContent("Staff");
  });

  it("offers only removal on an archived event, which the server still allows", async () => {
    setLifecycle(EVENT, "ARCHIVED", 3);
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    expect(
      await within(region).findByText("보관된 행사에서는 역할을 바꿀 수 없어요. 운영자 빼기는 할 수 있어요."),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /로 변경$/ })).not.toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "Local manager 빼기" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "빼기" }));

    expect(await within(region).findByRole("status")).toHaveTextContent("Local manager님을 행사 운영자에서 뺐어요.");
  });

  it("shows a retry message for an unexpected failure", async () => {
    server.use(http.patch(STAFF_PATH, () => problem(409, "UNKNOWN_CONFLICT", { detail: "hidden" })));
    await login({ userId: OWNER });
    openApp();

    const region = await operatorsRegion();
    fireEvent.click(await within(region).findByRole("button", { name: "Local staff Manager로 변경" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "역할 바꾸기" }));

    expect(await within(region).findByRole("alert")).toHaveTextContent("역할을 바꾸지 못했어요. 다시 시도해 주세요.");
  });
});
