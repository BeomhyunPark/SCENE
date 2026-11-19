import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login, logout } from "../api/session";
import { acceptInvitation } from "../api/invitations";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createInvitation } from "../mocks/invitationStore";
import { setLifecycle } from "../mocks/operatorStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

async function invite(email: string, role: "MANAGER" | "STAFF") {
  fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("역할"), { target: { value: role } });
  fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
}

describe("event operators and invitations", () => {
  let setItem: { mock: { calls: unknown[][] } };

  beforeEach(() => {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn() } });
    }
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    setItem = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists operators and lets the owner create an invitation link shown once", async () => {
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);

    const operators = await screen.findByRole("region", { name: "운영자" });
    expect(await within(operators).findByText("Local owner")).toBeInTheDocument();
    expect(within(operators).getByText("Local staff")).toBeInTheDocument();
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();

    await invite("New@Example.com", "MANAGER");

    const link = (await screen.findByLabelText("초대 링크")) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`^${window.location.origin}/operator/invitations#[A-Za-z0-9_-]{20,}$`));
    expect(screen.getByRole("status")).toHaveTextContent("new@example.com에게 보낼 링크예요.");
    const token = link.value.split("#")[1];
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.value);

    const pending = await screen.findByRole("list", { name: "대기 중인 초대" });
    expect(within(pending).getByText("new@example.com")).toBeInTheDocument();
    expect(within(pending).getByText("Manager")).toBeInTheDocument();
    expect(pending.textContent ?? "").not.toContain(token);
    const stored = setItem.mock.calls.map((call: unknown[]) => String(call[1])).join(" ");
    expect(stored).not.toContain(token);
  });

  it("resends with a new link and revokes a pending invitation", async () => {
    await login({ userId: OWNER });
    const first = createInvitation(EVENT, OWNER, { email: "a@example.com", role: "STAFF" });
    if ("code" in first) throw new Error(first.code);
    openApp(`/events/${EVENT}/operators`);

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 다시 보내기" }));
    const link = (await screen.findByLabelText("초대 링크")) as HTMLInputElement;
    expect(link.value.endsWith(first.link)).toBe(false);
    expect(link.value).toContain("/operator/invitations#");

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 초대 취소" }));
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
  });

  it("asks for a valid email", async () => {
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);

    await invite("not-an-email", "STAFF");

    expect(await screen.findByText("이메일을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
  });

  it("hides invitations from a non-owner", async () => {
    await login({ userId: localUsers[1].userId });
    openApp(`/events/${EVENT}/operators`);

    expect(await screen.findByText("Local owner")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "외부 협력자 초대" })).not.toBeInTheDocument());
    expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
  });

  it("does not offer invitations on an archived event", async () => {
    setLifecycle(EVENT, "ARCHIVED", 3);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);

    expect(await screen.findAllByText("보관된 행사에는 초대할 수 없어요.")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "초대 링크 만들기" })).not.toBeInTheDocument();
  });

  it("adds the invited person as an operator after they accept", async () => {
    await login({ userId: OWNER });
    const issued = createInvitation(EVENT, OWNER, { email: "staff@example.com", role: "MANAGER" });
    if ("code" in issued) throw new Error(issued.code);
    await logout();
    await login({ userId: localUsers[2].userId, email: "staff@example.com" });
    // Already a STAFF operator: the invitation is used up and the role stays STAFF (#387).
    expect(await acceptInvitation(issued.link.split("#")[1])).toEqual({ outcome: "ACCEPTED", eventId: EVENT, role: "STAFF" });
    await logout();
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);

    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();
    const operators = screen.getByRole("region", { name: "운영자" });
    const staff = within(operators).getByText("Local staff").closest("li");
    expect(staff).toHaveTextContent("Staff");
  });
});
