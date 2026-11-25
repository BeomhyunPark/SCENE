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
import { addOperator as seedOperator } from "../mocks/taskStore";
import { optionLabels, selectValue } from "../test/select";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const MANAGER = localUsers[1].userId;
const MEMBER = localUsers[4];
const ADD_PATH = `/api/v1/operator/events/${EVENT}/operators`;

function openApp() {
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT}/operators`]}>
      <App />
    </MemoryRouter>,
  );
}

function addSection() {
  return screen.findByRole("region", { name: "조직 멤버 추가" });
}

function postFails(status: number, code: string, errors?: { field: string }[]) {
  server.use(http.post(ADD_PATH, () => problem(status, code, { detail: "hidden", errors })));
}

describe("event owner adds organization members (#363)", () => {
  it("lists only members who are not operators yet and adds one as STAFF", async () => {
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    const member = await within(section).findByLabelText("조직 멤버");
    expect(optionLabels(member)).toEqual(["Local member"]);
    expect(selectValue(within(section).getByLabelText("추가할 역할"))).toBe("STAFF");
    expect(within(section).getByLabelText("추가할 역할")).toHaveTextContent("Staff");

    fireEvent.click(within(section).getByRole("button", { name: "운영자로 추가" }));

    expect(await within(section).findByRole("status")).toHaveTextContent("Local member님을 Staff 역할로 추가했어요.");
    const operators = screen.getByRole("region", { name: "운영자" });
    const row = (await within(operators).findByText("Local member")).closest("li");
    expect(row).toHaveTextContent("Staff");
    expect(within(operators).getByText("4명")).toBeInTheDocument();
    expect(operatorRequests.find((request) => request.method === "POST" && request.url === ADD_PATH)?.body).toEqual({
      userId: MEMBER.userId,
      role: "STAFF",
    });
    expect(await within(section).findByText("추가할 수 있는 조직 멤버가 없어요. 모두 이 행사의 운영자예요.")).toBeInTheDocument();
  });

  it("says in one line what MANAGER and STAFF do by default (DEC-079 Follow-up 2026-11-20)", async () => {
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    const role = await within(section).findByLabelText("추가할 역할");
    expect(role).toHaveAccessibleDescription(
      "Manager: 행사 시작·종료와 운영 멤버 관리만 빼고 모두 할 수 있어요 · Staff: 체크인과 보기만 할 수 있어요",
    );
  });

  it("adds a member as MANAGER", async () => {
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    fireEvent.change(await within(section).findByLabelText("추가할 역할"), { target: { value: "MANAGER" } });
    fireEvent.click(within(section).getByRole("button", { name: "운영자로 추가" }));

    const operators = screen.getByRole("region", { name: "운영자" });
    const row = (await within(operators).findByText("Local member")).closest("li");
    expect(row).toHaveTextContent("Manager");
  });

  it("is hidden from a non-owner, who never reads the member list", async () => {
    await login({ userId: MANAGER });
    openApp();

    expect(await screen.findByText("Local owner")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "조직 멤버 추가" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "운영자로 추가" })).not.toBeInTheDocument();
    expect(operatorRequests.some((request) => request.url.includes("/members"))).toBe(false);
  });

  it("says when every member is already an operator", async () => {
    seedOperator(EVENT, MEMBER.userId, MEMBER.displayName, "STAFF");
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    expect(await within(section).findByText("추가할 수 있는 조직 멤버가 없어요. 모두 이 행사의 운영자예요.")).toBeInTheDocument();
    expect(within(section).queryByLabelText("조직 멤버")).not.toBeInTheDocument();
  });

  it("explains an already-operator conflict and refreshes the list", async () => {
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    await within(section).findByLabelText("조직 멤버");
    // Someone else adds the member after the list loaded.
    seedOperator(EVENT, MEMBER.userId, MEMBER.displayName, "MANAGER");
    fireEvent.click(within(section).getByRole("button", { name: "운영자로 추가" }));

    expect(await within(section).findByRole("alert")).toHaveTextContent("이미 이 행사의 운영자예요.");
    const operators = screen.getByRole("region", { name: "운영자" });
    expect(await within(operators).findByText("Local member")).toBeInTheDocument();
    expect(await within(section).findByText("추가할 수 있는 조직 멤버가 없어요. 모두 이 행사의 운영자예요.")).toBeInTheDocument();
  });

  it("explains a target who is no longer a member", async () => {
    postFails(404, "RESOURCE_NOT_FOUND");
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    await within(section).findByLabelText("조직 멤버");
    fireEvent.click(within(section).getByRole("button", { name: "운영자로 추가" }));

    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "조직 멤버가 아니라서 추가할 수 없어요. 멤버 목록을 새로 불러왔어요.",
    );
  });

  it("explains an archived event", async () => {
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    await within(section).findByLabelText("조직 멤버");
    setLifecycle(EVENT, "ARCHIVED", 3);
    fireEvent.click(within(section).getByRole("button", { name: "운영자로 추가" }));

    expect(await within(section).findByRole("alert")).toHaveTextContent("보관된 행사에는 운영자를 추가할 수 없어요.");
  });

  it("does not offer the add on an archived event", async () => {
    setLifecycle(EVENT, "ARCHIVED", 3);
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    expect(within(section).getByText("보관된 행사에는 운영자를 추가할 수 없어요.")).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "운영자로 추가" })).not.toBeInTheDocument();
  });

  it("explains a forbidden add", async () => {
    postFails(403, "FORBIDDEN");
    await login({ userId: OWNER });
    openApp();

    const section = await addSection();
    await within(section).findByLabelText("조직 멤버");
    fireEvent.click(within(section).getByRole("button", { name: "운영자로 추가" }));

    expect(await within(section).findByRole("alert")).toHaveTextContent("운영자를 추가할 권한이 없어요.");
  });

  it("keeps the outsider invitation under its own heading", async () => {
    await login({ userId: OWNER });
    openApp();

    const invite = await screen.findByRole("region", { name: "외부 협력자 초대" });
    expect(within(invite).getByText(/조직 멤버가 아닌 분은 이메일로 초대해 주세요/)).toBeInTheDocument();
    expect(within(invite).getByRole("button", { name: "초대 메일 보내기" })).toBeInTheDocument();
  });
});
