import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localSpace, localUsers } from "../mocks/fixtures/seed";
import { operatorRequests } from "../mocks/operatorStore";
import { mailedLinks, setMockMailDelivery } from "../mocks/mailOutbox";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { seedSpaceInvitation } from "../mocks/spaceInvitationStore";
import { http } from "msw";

const SPACE = localSpace.spaceId;
const [OWNER, ADMIN, MEMBER] = localUsers.map((user) => user.userId);

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** "멤버 초대" opens the invite dialog (P14 초대, #494). */
async function invite(email: string) {
  fireEvent.click(await screen.findByRole("button", { name: "멤버 초대" }));
  const dialog = await screen.findByRole("dialog", { name: "멤버 초대" });
  fireEvent.change(within(dialog).getByLabelText("이메일"), { target: { value: email } });
  fireEvent.click(within(dialog).getByRole("button", { name: "초대 메일 보내기" }));
  return dialog;
}

describe("organization members page (#376)", () => {
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

  it("shows members with emails to the owner and mails a MEMBER invitation without showing the link", async () => {
    await login({ userId: OWNER });
    openApp("/members");

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

    expect(await screen.findByRole("status")).toHaveTextContent("new@example.com에게 초대 메일을 보냈어요.");
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "복사" })).not.toBeInTheDocument();
    const mailed = mailedLinks();
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).toMatch(/^\/operator\/invitations#s\.[A-Za-z0-9_-]{20,}$/);
    const token = mailed[0].split("#")[1];
    expect(document.body.textContent ?? "").not.toContain(token);

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

  it("shows the link once when mail is off on the server", async () => {
    setMockMailDelivery("LINK");
    await login({ userId: OWNER });
    openApp("/members");
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();

    await invite("New@Example.com");

    const link = (await screen.findByLabelText("초대 링크")) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`^${window.location.origin}/operator/invitations#s\\.[A-Za-z0-9_-]{20,}$`));
    expect(screen.getByRole("status")).toHaveTextContent("메일 발송이 꺼져 있어 링크를 직접 전달해 주세요.");
    expect(screen.getByRole("status")).toHaveTextContent("new@example.com에게 보낼 링크예요.");
    const token = link.value.split("#")[1];
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.value);
    const stored = setItem.mock.calls.map((call: unknown[]) => String(call[1])).join(" ");
    expect(stored).not.toContain(token);
  });

  it("says so when the mail could not be sent, without sending again by itself", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/invitations", () => {
        calls += 1;
        return problem(502, "MAIL_SEND_FAILED");
      }),
    );
    await login({ userId: OWNER });
    openApp("/members");

    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();
    await invite("new@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("초대 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it("resends a new mail, swaps the id, and revokes", async () => {
    await login({ userId: OWNER });
    const first = seedSpaceInvitation(SPACE, "a@example.com");
    openApp("/members");

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 다시 보내기" }));
    expect(await screen.findByRole("status")).toHaveTextContent("a@example.com에게 초대 메일을 보냈어요.");
    const mailed = mailedLinks();
    expect(mailed).toHaveLength(1);
    expect(mailed[0].endsWith(first)).toBe(false);
    expect(mailed[0]).toContain("/operator/invitations#s.");

    fireEvent.click(await screen.findByRole("button", { name: "a@example.com 초대 취소" }));
    expect(await screen.findByText("대기 중인 초대가 없어요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("puts the cursor in the email field and checks the address before sending (#525)", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/operator/spaces/:spaceId/invitations", () => {
        calls += 1;
        return problem(400, "VALIDATION_FAILED");
      }),
    );
    await login({ userId: OWNER });
    openApp("/members");

    fireEvent.click(await screen.findByRole("button", { name: "멤버 초대" }));
    const opened = await screen.findByRole("dialog", { name: "멤버 초대" });
    expect(within(opened).getByLabelText("이메일")).toHaveFocus();
    fireEvent.click(within(opened).getByRole("button", { name: "돌아가기" }));

    for (const wrong of ["abc", "a@", "@example.com", "a@b@example.com", "a b@example.com"]) {
      const dialog = await invite(wrong);
      expect(await within(dialog).findByText("이메일을 확인해 주세요.")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("이메일")).toHaveAttribute("aria-invalid", "true");
      fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    }
    expect(calls).toBe(0);
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
  });

  it("lets an ADMIN invite too", async () => {
    await login({ userId: ADMIN });
    openApp("/members");

    expect(await screen.findByRole("button", { name: "멤버 초대" })).toBeInTheDocument();
    const members = await screen.findByRole("list", { name: "멤버" });
    expect(await within(members).findByText("owner@example.com")).toBeInTheDocument();
    await invite("helper@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("helper@example.com에게 초대 메일을 보냈어요.");
  });

  it("shows a MEMBER names and roles only, without invitations", async () => {
    await login({ userId: MEMBER });
    openApp("/members");

    const members = await screen.findByRole("list", { name: "멤버" });
    expect(await within(members).findByText("Local owner")).toBeInTheDocument();
    expect(within(members).getByText("Admin")).toBeInTheDocument();
    expect(members.textContent ?? "").not.toContain("@");
    expect(screen.queryByRole("heading", { name: "조직에서 나가기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "멤버 초대" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "대기 중인 초대" })).not.toBeInTheDocument();
    await waitFor(() => expect(operatorRequests.some((request) => request.url.includes("/invitations"))).toBe(false));
  });
});
