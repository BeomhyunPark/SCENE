import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login, logout } from "../api/session";
import { acceptInvitation } from "../api/invitations";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createInvitation } from "../mocks/invitationStore";
import { mailedLinks, setMockMailDelivery } from "../mocks/mailOutbox";
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

/** "운영자 추가" → 외부 협력자 초대 in the dialog (#494). */
async function invite(email: string, role: "MANAGER" | "STAFF") {
  fireEvent.click(await screen.findByRole("button", { name: "운영자 추가" }));
  const dialog = await screen.findByRole("dialog", { name: "운영자 추가" });
  fireEvent.click(within(dialog).getByRole("radio", { name: "외부 협력자 초대" }));
  fireEvent.change(within(dialog).getByLabelText("이메일"), { target: { value: email } });
  fireEvent.change(within(dialog).getByLabelText("역할"), { target: { value: role } });
  fireEvent.click(within(dialog).getByRole("button", { name: "초대 메일 보내기" }));
  return dialog;
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

  it("lists operators and lets the owner mail an invitation without seeing the link", async () => {
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);

    const operators = await screen.findByRole("region", { name: "운영자" });
    expect(await within(operators).findByText("Local owner")).toBeInTheDocument();
    expect(within(operators).getByText("Local staff")).toBeInTheDocument();
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();

    await invite("New@Example.com", "MANAGER");

    expect(await screen.findByRole("status")).toHaveTextContent("new@example.com에게 초대 메일을 보냈어요.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // An empty list says so once, without a 0건 count beside it (#494).
    expect(screen.queryByText("0건")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "복사" })).not.toBeInTheDocument();
    const mailed = mailedLinks();
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).toMatch(/^\/operator\/invitations#[A-Za-z0-9_-]{20,}$/);
    const token = mailed[0].split("#")[1];
    expect(document.body.textContent ?? "").not.toContain(token);

    const pending = await screen.findByRole("list", { name: "대기 중인 초대" });
    expect(within(pending).getByText("new@example.com")).toBeInTheDocument();
    expect(within(pending).getByText("Manager")).toBeInTheDocument();
    expect(pending.textContent ?? "").not.toContain(token);
    const stored = setItem.mock.calls.map((call: unknown[]) => String(call[1])).join(" ");
    expect(stored).not.toContain(token);
  });

  it("shows the link once when mail is off on the server", async () => {
    setMockMailDelivery("LINK");
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();

    await invite("New@Example.com", "STAFF");

    const link = (await screen.findByLabelText("초대 링크")) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`^${window.location.origin}/operator/invitations#[A-Za-z0-9_-]{20,}$`));
    expect(screen.getByRole("status")).toHaveTextContent("메일 발송이 꺼져 있어 링크를 직접 전달해 주세요.");
    expect(screen.getByRole("status")).toHaveTextContent("new@example.com에게 보낼 링크예요.");
    const token = link.value.split("#")[1];
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.value);
    const stored = setItem.mock.calls.map((call: unknown[]) => String(call[1])).join(" ");
    expect(stored).not.toContain(token);
  });

  it("resends a new mail and revokes a pending invitation", async () => {
    await login({ userId: OWNER });
    const first = createInvitation(EVENT, OWNER, { email: "a@example.com", role: "STAFF" });
    if ("code" in first) throw new Error(first.code);
    openApp(`/events/${EVENT}/operators`);

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 다시 보내기" }));
    expect(await screen.findByRole("status")).toHaveTextContent("a@example.com에게 초대 메일을 보냈어요.");
    const mailed = mailedLinks();
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).not.toBe(first.link);
    expect(mailed[0]).toContain("/operator/invitations#");

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 초대 취소" }));
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("asks for a valid email", async () => {
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);

    const dialog = await invite("not-an-email", "STAFF");

    expect(await within(dialog).findByText("이메일을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "운영자 추가" })).toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
  });

  it("hides invitations from a non-owner", async () => {
    await login({ userId: localUsers[1].userId });
    openApp(`/events/${EVENT}/operators`);

    expect(await screen.findByText("Local owner")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "운영자 추가" })).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "대기 중인 초대" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
  });

  it("does not offer invitations on an archived event", async () => {
    setLifecycle(EVENT, "ARCHIVED", 3);
    await login({ userId: OWNER });
    openApp(`/events/${EVENT}/operators`);

    expect(await screen.findByText(/보관된 행사에는 운영자를 추가할 수 없어요./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "운영자 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 메일 보내기" })).not.toBeInTheDocument();
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
