import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login, logout } from "../api/session";
import { INVITATION_STORAGE_KEY, resetInvitationCaptureState } from "../invitationToken";
import { localEvent, localSpace, localUsers } from "../mocks/fixtures/seed";
import { createInvitation } from "../mocks/invitationStore";
import { addEvent, addMembership, addSpace, operatorRequests } from "../mocks/operatorStore";
import { server } from "../mocks/server";
import { addOperator as seedOperator } from "../mocks/taskStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0];
const ADMIN = localUsers[1];
const STAFF = localUsers[2];
const FORMER = localUsers[5];
const FORMER_EMAIL = "former@example.com";

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** The owner makes an event invitation; the link's token is what the invitee opens. */
async function inviteAs(email: string, role: "MANAGER" | "STAFF"): Promise<string> {
  await login({ userId: OWNER.userId });
  const issued = createInvitation(EVENT, OWNER.userId, { email, role });
  if ("code" in issued) throw new Error(issued.code);
  await logout();
  return issued.link.split("#")[1];
}

function openInvitation(token: string) {
  resetInvitationCaptureState();
  localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ token, storedAt: Date.now() }));
  window.history.replaceState(null, "", "/operator/invitations");
  return openApp("/operator/invitations");
}

function otherSpaceEvent(spaceId: string, spaceName: string, name: string) {
  addSpace(spaceId, spaceName);
  const eventId = crypto.randomUUID();
  addEvent({
    eventId,
    spaceId,
    name,
    lifecycleStatus: "DRAFT",
    lifecycleVersion: 0,
    startDate: null,
    endDate: null,
    place: null,
    eventType: null,
  });
  return eventId;
}

describe("event-only collaborators see and open their events (#387)", () => {
  it("lets someone who left the organization accept an event invitation, find it and open it", async () => {
    const token = await inviteAs(FORMER_EMAIL, "STAFF");
    await login({ userId: FORMER.userId, email: FORMER_EMAIL });
    openInvitation(token);

    expect(await screen.findByRole("heading", { name: "Local event 초대를 받았어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/이미/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락" }));
    expect(await screen.findByRole("heading", { name: "Local event 초대를 수락했어요" })).toBeInTheDocument();
    expect(screen.getByText("이제 Staff로 이 행사를 운영할 수 있어요.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "행사 목록" }));
    expect(await screen.findByRole("heading", { name: "협력 중인 행사" })).toBeInTheDocument();
    expect(screen.queryByText("아직 들어간 조직이 없어요")).toBeNull();
    expect(screen.queryByRole("button", { name: /새 행사/ })).toBeNull();
    const row = screen.getByRole("button", { name: /Local event/ });
    expect(row).toHaveTextContent("Local space · Staff");
    expect(operatorRequests.some((request) => request.url.startsWith("/api/v1/operator/events?"))).toBe(true);

    fireEvent.click(row);
    expect(await screen.findByRole("heading", { name: "지금 시작할 일" })).toBeInTheDocument();
    // The event's own organization name, though the collaborator has no space list.
    expect((await screen.findAllByText("Local space")).length).toBeGreaterThan(0);
  });

  it("opens the event from the accepted screen", async () => {
    const token = await inviteAs(FORMER_EMAIL, "MANAGER");
    await login({ userId: FORMER.userId, email: FORMER_EMAIL });
    openInvitation(token);
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: "행사 열기" }));
    expect(await screen.findByRole("heading", { name: "지금 시작할 일" })).toBeInTheDocument();
  });

  it("tells an operator who kept the event that the role stays as it was", async () => {
    // Local staff is already a STAFF operator, like a member who left and kept this event.
    const token = await inviteAs("staff@example.com", "MANAGER");
    await login({ userId: STAFF.userId, email: "staff@example.com" });
    openInvitation(token);
    expect(await screen.findByText("Local owner님이 Manager로 초대했어요.", undefined, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락" }));
    expect(await screen.findByRole("heading", { name: "Local event 초대를 수락했어요" })).toBeInTheDocument();
    expect(
      screen.getByText("이미 이 행사에서 Staff로 운영하고 있어서 역할은 그대로예요. 역할을 바꾸려면 행사 Owner에게 요청해 주세요."),
    ).toBeInTheDocument();
  });

  it("offers the event when the same link is opened again after accepting", async () => {
    const token = await inviteAs(FORMER_EMAIL, "STAFF");
    await login({ userId: FORMER.userId, email: FORMER_EMAIL });
    openInvitation(token);
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    await screen.findByRole("heading", { name: "Local event 초대를 수락했어요" });
    screen.getByRole("button", { name: "행사 목록" });
    // Reopen the link in a fresh page.
    document.body.innerHTML = "";
    openInvitation(token);
    expect(await screen.findByRole("heading", { name: "Local event 초대는 이미 수락했어요" }, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "행사 열기" }));
    expect(await screen.findByRole("heading", { name: "지금 시작할 일" })).toBeInTheDocument();
  });

  it("shows a member their organization's events and, below, events in other organizations", async () => {
    const other = otherSpaceEvent(crypto.randomUUID(), "Bravo church", "Bravo retreat");
    seedOperator(other, ADMIN.userId, ADMIN.displayName, "STAFF");
    await login({ userId: ADMIN.userId });
    openApp("/events");

    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
    const collab = await screen.findByRole("region", { name: "협력 중인 행사" });
    expect(within(collab).getByText("다른 조직에서 운영자로 함께하는 행사예요.")).toBeInTheDocument();
    expect(within(collab).getByRole("button", { name: /Bravo retreat/ })).toHaveTextContent("Bravo church · Staff");
    // The organization's own event is not repeated below.
    expect(within(collab).queryByText("Local event")).toBeNull();

    fireEvent.click(within(collab).getByRole("button", { name: /Bravo retreat/ }));
    expect(await screen.findByRole("heading", { name: "지금 시작할 일" })).toBeInTheDocument();
    expect((await screen.findAllByText("Bravo church")).length).toBeGreaterThan(0);
  });

  it("shows no collaboration section when every event is in the member's organization", async () => {
    await login({ userId: OWNER.userId });
    openApp("/events");
    expect(await screen.findByRole("heading", { name: "Local space의 행사" })).toBeInTheDocument();
    await waitFor(() =>
      expect(operatorRequests.some((request) => request.url.startsWith("/api/v1/operator/events?"))).toBe(true),
    );
    expect(screen.queryByRole("heading", { name: "협력 중인 행사" })).toBeNull();
  });

  it("offers to retry when the collaboration list fails without an organization", async () => {
    let fail = true;
    server.use(
      http.get("/api/v1/operator/events", () =>
        fail
          ? HttpResponse.error()
          : HttpResponse.json({ items: [], page: { number: 0, size: 100, totalItems: 0, totalPages: 0 } }),
      ),
    );
    await login({ userId: FORMER.userId });
    openApp("/events");
    expect(await screen.findByText("불러오지 못했어요.", undefined, { timeout: 4000 })).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("아직 들어간 조직이 없어요")).toBeInTheDocument();
  });

  it("explains the members and settings menus to someone without an organization", async () => {
    await login({ userId: FORMER.userId });
    openApp("/members");
    expect(await screen.findByRole("heading", { name: "들어간 조직이 없어요" })).toBeInTheDocument();
    expect(
      screen.getByText("멤버 화면은 조직 멤버만 써요. 운영자로 함께하는 행사는 행사 목록의 협력 중인 행사에서 열 수 있어요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "행사 목록으로" })).toHaveAttribute("href", "/events");
  });

  it("lists members of the event's own organization when the owner adds operators", async () => {
    // "Zeta church" sorts after "Local space", so it is not the owner's first organization.
    const zeta = crypto.randomUUID();
    const event = otherSpaceEvent(zeta, "Zeta church", "Zeta retreat");
    addMembership(zeta, OWNER.userId, "OWNER");
    seedOperator(event, OWNER.userId, OWNER.displayName, "OWNER");
    await login({ userId: OWNER.userId });
    openApp(`/events/${event}/operators`);

    expect(await screen.findByRole("region", { name: "조직 멤버 추가" })).toBeInTheDocument();
    await waitFor(() =>
      expect(operatorRequests.map((request) => request.url)).toContain(
        `/api/v1/operator/spaces/${zeta}/members?page=0&size=100`,
      ),
    );
    expect(
      operatorRequests.some((request) => request.url.startsWith(`/api/v1/operator/spaces/${localSpace.spaceId}/members`)),
    ).toBe(false);
  });
});
