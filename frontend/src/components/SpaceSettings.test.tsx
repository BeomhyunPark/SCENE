import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localSpace, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests } from "../mocks/operatorStore";
import { seedSpaceInvitation } from "../mocks/spaceInvitationStore";

const SPACE = localSpace.spaceId;
const [OWNER, ADMIN, MEMBER] = localUsers.map((user) => user.userId);

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

async function invite(email: string) {
  fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
}

describe("space settings members and invitations", () => {
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

  it("shows members with emails to the owner and creates a MEMBER link shown once", async () => {
    await login({ userId: OWNER });
    openApp("/settings");

    const members = await screen.findByRole("list", { name: "멤버" });
    const rows = await within(members).findAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Local ownerowner@example.comOwner",
      "Local managermanager@example.comAdmin",
      // Seed member who is not an operator of the seed event (#363).
      "Local memberMember",
      "Local staffMember",
    ]);
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("역할")).not.toBeInTheDocument();

    await invite("New@Example.com");

    const link = (await screen.findByLabelText("초대 링크")) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`^${window.location.origin}/operator/invitations#s\\.[A-Za-z0-9_-]{20,}$`));
    expect(screen.getByRole("status")).toHaveTextContent("new@example.com에게 보낼 링크예요.");
    const token = link.value.split("#")[1];
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.value);

    const pending = await screen.findByRole("list", { name: "대기 중인 초대" });
    expect(within(pending).getByText("new@example.com")).toBeInTheDocument();
    expect(within(pending).getByText("Member")).toBeInTheDocument();
    expect(pending.textContent ?? "").not.toContain(token);
    const stored = setItem.mock.calls.map((call: unknown[]) => String(call[1])).join(" ");
    expect(stored).not.toContain(token);

    const create = operatorRequests.find(
      (request) => request.method === "POST" && request.url === `/api/v1/operator/spaces/${SPACE}/invitations`,
    );
    expect(create?.body).toEqual({ email: "New@Example.com" });
  });

  it("resends with a new link, swaps the id, and revokes", async () => {
    await login({ userId: OWNER });
    const first = seedSpaceInvitation(SPACE, "a@example.com");
    openApp("/settings");

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 다시 보내기" }));
    const link = (await screen.findByLabelText("초대 링크")) as HTMLInputElement;
    expect(link.value.endsWith(first)).toBe(false);
    expect(link.value).toContain("/operator/invitations#s.");

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 초대 취소" }));
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for a valid email", async () => {
    await login({ userId: OWNER });
    openApp("/settings");

    await invite("not-an-email");

    expect(await screen.findByText("이메일을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
  });

  it("lets an ADMIN invite too", async () => {
    await login({ userId: ADMIN });
    openApp("/settings");

    expect(await screen.findByRole("heading", { name: "멤버 초대하기" })).toBeInTheDocument();
    const members = await screen.findByRole("list", { name: "멤버" });
    expect(await within(members).findByText("owner@example.com")).toBeInTheDocument();
    await invite("helper@example.com");
    expect(await screen.findByLabelText("초대 링크")).toBeInTheDocument();
  });

  it("shows a MEMBER names and roles only, without invitations", async () => {
    await login({ userId: MEMBER });
    openApp("/settings");

    const members = await screen.findByRole("list", { name: "멤버" });
    expect(await within(members).findByText("Local owner")).toBeInTheDocument();
    expect(within(members).getByText("Admin")).toBeInTheDocument();
    expect(members.textContent ?? "").not.toContain("@");
    expect(screen.getByRole("heading", { name: "조직에서 나가기" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "멤버 초대하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 링크 만들기" })).not.toBeInTheDocument();
    await waitFor(() => expect(operatorRequests.some((request) => request.url.includes("/invitations"))).toBe(false));
  });
});
