import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createQueryClient } from "../api/queryClient";
import { login, logout } from "../api/session";
import { INVITATION_STORAGE_KEY, resetInvitationCaptureState, storedInvitationToken } from "../invitationToken";
import { localEvent, localSpace, localUsers } from "../mocks/fixtures/seed";
import { createInvitation } from "../mocks/invitationStore";
import { operatorRequests } from "../mocks/operatorStore";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { seedSpaceInvitation } from "../mocks/spaceInvitationStore";
import { InvitationAccept } from "./InvitationAccept";

const SPACE = localSpace.spaceId;
const OWNER = localUsers[0].userId;
const STAFF = localUsers[2].userId;
const GUEST = localUsers[3].userId;
const GUEST_EMAIL = "guest@example.com";

afterEach(() => {
  resetInvitationCaptureState();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

function seedToken(token: string) {
  localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ token, storedAt: Date.now() }));
}

function renderInvite() {
  resetInvitationCaptureState();
  window.history.replaceState(null, "", "/operator/invitations");
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/operator/invitations"]}>
        <Routes>
          <Route path="/operator/invitations" element={<InvitationAccept />} />
          <Route path="/" element={<p>공개 홈</p>} />
          <Route path="/login" element={<p>로그인 자리</p>} />
          <Route path="/events" element={<p>행사 목록 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function paths(): string[] {
  return operatorRequests.map((request) => request.url);
}

describe("space invitation accept", () => {
  it("previews and accepts a space invitation as a member of the space", async () => {
    const token = seedSpaceInvitation(SPACE, GUEST_EMAIL);
    await login({ userId: GUEST, email: GUEST_EMAIL });
    seedToken(token);
    renderInvite();

    expect(
      await screen.findByRole("heading", { name: "Local space 조직 초대를 받았어요" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Local owner님이 Local space 조직의 멤버로 초대했어요./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락" }));

    expect(await screen.findByRole("heading", { name: "Local space 조직의 멤버가 됐어요" })).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
    expect(paths()).toEqual([
      "/api/v1/operator/space-invitations/preview",
      "/api/v1/operator/space-invitations/accept",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "행사 목록" }));
    expect(await screen.findByText("행사 목록 화면")).toBeInTheDocument();
  });

  it("tells an active member they are already in and clears the token", async () => {
    const token = seedSpaceInvitation(SPACE, "staff@example.com");
    await login({ userId: STAFF, email: "staff@example.com" });
    seedToken(token);
    renderInvite();

    expect(
      await screen.findByRole("heading", { name: "이미 Local space 조직의 멤버예요" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 수락" })).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "행사 목록" }));
    expect(await screen.findByText("행사 목록 화면")).toBeInTheDocument();
  });

  it("shows already member when accept reports ALREADY_MEMBER", async () => {
    server.use(
      http.post("/api/v1/operator/space-invitations/preview", () =>
        HttpResponse.json({
          spaceName: "청년부",
          role: "MEMBER",
          inviterName: "김운영",
          expiresAt: "2026-11-26T00:00:00Z",
          outcome: "PENDING",
        }),
      ),
      http.post("/api/v1/operator/space-invitations/accept", () =>
        HttpResponse.json({ outcome: "ALREADY_MEMBER", spaceId: SPACE }),
      ),
    );
    await login({ userId: GUEST, email: GUEST_EMAIL });
    seedToken("s.race-token");
    renderInvite();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "이미 청년부 조직의 멤버예요" })).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("shows already accepted when this account accepted before", async () => {
    const token = seedSpaceInvitation(SPACE, GUEST_EMAIL);
    await login({ userId: GUEST, email: GUEST_EMAIL });
    seedToken(token);
    const first = renderInvite();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    await screen.findByRole("heading", { name: "Local space 조직의 멤버가 됐어요" });
    first.unmount();

    seedToken(token);
    renderInvite();
    expect(await screen.findByRole("heading", { name: "이미 수락한 초대예요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("keeps the token on an email mismatch so the right account can sign in", async () => {
    const token = seedSpaceInvitation(SPACE, GUEST_EMAIL);
    await login({ userId: GUEST, email: "someone@example.com" });
    seedToken(token);
    renderInvite();
    expect(await screen.findByRole("heading", { name: "초대한 이메일과 달라요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(storedInvitationToken()).toBe(token);
  });

  it.each([
    [410, "INVITATION_REVOKED", "초대가 취소됐어요"],
    [410, "INVITATION_SUPERSEDED", "새 초대로 바뀌었어요"],
    [410, "INVITATION_EXPIRED", "초대가 만료됐어요"],
    [404, "INVITATION_NOT_FOUND", "사용할 수 없는 링크예요"],
  ] as const)("clears the token for %s %s", async (status, code, title) => {
    server.use(http.post("/api/v1/operator/space-invitations/preview", () => problem(status, code)));
    await login({ userId: GUEST, email: GUEST_EMAIL });
    seedToken("s.some-token");
    renderInvite();
    expect(await screen.findByRole("heading", { name: title }, { timeout: 4000 })).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("still sends an event token to the event invitation paths", async () => {
    const issued = createInvitation(localEvent.eventId, OWNER, { email: GUEST_EMAIL, role: "STAFF" });
    if ("code" in issued) throw new Error(issued.code);
    const token = issued.link.split("#")[1];
    let spaceCalled = false;
    server.use(
      http.post("/api/v1/operator/space-invitations/preview", () => {
        spaceCalled = true;
        return problem(404, "INVITATION_NOT_FOUND");
      }),
    );
    await login({ userId: GUEST, email: GUEST_EMAIL });
    seedToken(token);
    renderInvite();
    expect(await screen.findByRole("heading", { name: "Local event 초대를 받았어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("Local owner님이 Staff로 초대했어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락" }));
    expect(await screen.findByRole("heading", { name: "초대를 수락했어요" })).toBeInTheDocument();
    expect(spaceCalled).toBe(false);
  });
});

describe("space invitation from settings to events", () => {
  beforeEach(() => {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn() } });
    }
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("owner invites, the guest accepts, and the guest sees the space's events", async () => {
    await login({ userId: OWNER });
    const owner = render(
      <MemoryRouter initialEntries={["/settings"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: GUEST_EMAIL } });
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    const link = (await screen.findByLabelText("초대 링크")) as HTMLInputElement;
    const token = link.value.split("#")[1];
    owner.unmount();

    await logout();
    await login({ userId: GUEST, email: GUEST_EMAIL });
    resetInvitationCaptureState();
    window.history.replaceState(null, "", `/operator/invitations#${token}`);
    render(
      <MemoryRouter initialEntries={["/operator/invitations"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    fireEvent.click(await screen.findByRole("button", { name: "행사 목록" }));

    // A new MEMBER operates no event yet, so the list guides to creating the first one.
    expect(await screen.findByRole("heading", { name: "아직 만든 행사가 없어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText("Local event")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "첫 행사 만들기" })).toBeInTheDocument();
  });
});
