import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { login, logout } from "../api/session";
import { INVITATION_STORAGE_KEY, resetInvitationCaptureState, storedInvitationToken } from "../invitationToken";
import { localEvent, localSpace, localUsers } from "../mocks/fixtures/seed";
import { createInvitation } from "../mocks/invitationStore";
import { removeMembership } from "../mocks/operatorStore";
import { server } from "../mocks/server";
import { seedSpaceInvitation } from "../mocks/spaceInvitationStore";
import { eventRoleOf } from "../mocks/taskStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const PERSON = localUsers[3].userId;
const EMAIL = "guest@example.com";

/**
 * #387 confirmed cause: a person accepted an organization invitation, left the organization, then
 * opened a brand-new event invitation link and saw "이미 수락한 초대예요". The page was still holding
 * the old organization token, so the new event invitation stayed pending.
 */
function countPreviews() {
  const calls = { space: [] as string[], event: [] as string[] };
  server.events.on("request:start", async ({ request }) => {
    const url = new URL(request.url).pathname;
    if (url.endsWith("/space-invitations/preview")) calls.space.push(((await request.clone().json()) as { token: string }).token);
    if (url.endsWith("/operator/invitations/preview")) calls.event.push(((await request.clone().json()) as { token: string }).token);
  });
  return calls;
}

function openAt(hash: string) {
  resetInvitationCaptureState();
  window.history.replaceState(null, "", `/operator/invitations${hash}`);
  return render(
    <MemoryRouter initialEntries={["/operator/invitations"]}>
      <App />
    </MemoryRouter>,
  );
}

async function newEventLink(): Promise<string> {
  await logout();
  await login({ userId: OWNER });
  const issued = createInvitation(EVENT, OWNER, { email: EMAIL, role: "STAFF" });
  if ("code" in issued) throw new Error(issued.code);
  await logout();
  await login({ userId: PERSON, email: EMAIL });
  return issued.link.split("#")[1];
}

describe("a new invitation link never reuses an old token (#387)", () => {
  afterEach(() => {
    server.events.removeAllListeners();
  });

  it("accepts the new event invitation after an organization invitation was accepted and the person left", async () => {
    const calls = countPreviews();
    const spaceToken = seedSpaceInvitation(localSpace.spaceId, EMAIL);
    await login({ userId: PERSON, email: EMAIL });
    const first = openAt(`#${spaceToken}`);
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "Local space 조직의 멤버가 됐어요" })).toBeInTheDocument();
    first.unmount();
    removeMembership(localSpace.spaceId, PERSON);

    const eventToken = await newEventLink();
    openAt(`#${eventToken}`);
    expect(await screen.findByRole("heading", { name: "Local event 초대를 받았어요" }, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락" }));
    expect(await screen.findByRole("heading", { name: "Local event 초대를 수락했어요" })).toBeInTheDocument();
    expect(screen.queryByText(/이미/)).toBeNull();
    expect(eventRoleOf(EVENT, PERSON)).toBe("STAFF");
    expect(calls.space).toEqual([spaceToken]);
    expect(calls.event).toEqual([eventToken]);
  });

  it("switches to a new link opened in a tab that is still on the old invitation", async () => {
    const calls = countPreviews();
    const spaceToken = seedSpaceInvitation(localSpace.spaceId, EMAIL);
    await login({ userId: PERSON, email: EMAIL });
    openAt(`#${spaceToken}`);
    expect(await screen.findByRole("heading", { name: "Local space 조직 초대를 받았어요" }, { timeout: 4000 })).toBeInTheDocument();

    const eventToken = await newEventLink();
    // The address bar only changes the fragment: same page, no new mount.
    act(() => {
      window.history.replaceState(null, "", `/operator/invitations#${eventToken}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByRole("heading", { name: "Local event 초대를 받았어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(storedInvitationToken()).toBe(eventToken);
    fireEvent.click(screen.getByRole("button", { name: "초대 수락" }));
    expect(await screen.findByRole("heading", { name: "Local event 초대를 수락했어요" })).toBeInTheDocument();
    expect(eventRoleOf(EVENT, PERSON)).toBe("STAFF");
    expect(calls.space).toEqual([spaceToken]);
    expect(calls.event).toEqual([eventToken]);
  });

  it("lets the fragment win over an old stored organization token", async () => {
    const spaceToken = seedSpaceInvitation(localSpace.spaceId, EMAIL);
    localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ token: spaceToken, storedAt: Date.now() }));
    const eventToken = await newEventLink();
    openAt(`#${eventToken}`);
    expect(await screen.findByRole("heading", { name: "Local event 초대를 받았어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(storedInvitationToken()).toBe(eventToken);
  });

  it("names the organization when an organization invitation was already accepted", async () => {
    const spaceToken = seedSpaceInvitation(localSpace.spaceId, EMAIL);
    await login({ userId: PERSON, email: EMAIL });
    const first = openAt(`#${spaceToken}`);
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    await screen.findByRole("heading", { name: "Local space 조직의 멤버가 됐어요" });
    first.unmount();
    removeMembership(localSpace.spaceId, PERSON);
    openAt(`#${spaceToken}`);
    expect(await screen.findByRole("heading", { name: "Local space 조직 초대는 이미 수락했어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("names the event when an event invitation was already accepted", async () => {
    const eventToken = await newEventLink();
    const first = openAt(`#${eventToken}`);
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    await screen.findByRole("heading", { name: "Local event 초대를 수락했어요" });
    first.unmount();
    openAt(`#${eventToken}`);
    expect(await screen.findByRole("heading", { name: "Local event 초대는 이미 수락했어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "행사 열기" })).toBeInTheDocument();
  });

  it("drops a stored invitation token on a sidebar sign-out", async () => {
    await login({ userId: OWNER });
    localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ token: "s.old", storedAt: Date.now() }));
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }, { timeout: 4000 }));
    await waitFor(() => expect(storedInvitationToken()).toBeNull());
  });
});
