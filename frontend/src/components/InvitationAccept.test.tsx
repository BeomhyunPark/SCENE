import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { login } from "../api/session";
import { INVITATION_STORAGE_KEY, resetInvitationCaptureState, storedInvitationToken } from "../invitationToken";
import { localUsers } from "../mocks/fixtures/seed";
import { problem } from "../mocks/problem";
import { server } from "../mocks/server";
import { InvitationAccept } from "./InvitationAccept";

const TOKEN = "invite-token-value";
const SECRET = "hidden-server-detail";

afterEach(() => {
  resetInvitationCaptureState();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

function LoginSpot() {
  const location = useLocation();
  return (
    <p>
      로그인 자리 {location.pathname}
      {location.search}
      {location.hash}
    </p>
  );
}

function VerifySpot() {
  const location = useLocation();
  return (
    <p>
      이메일 인증 화면 {location.pathname}
      {location.search}
      {location.hash}
    </p>
  );
}

function renderInvite(hash?: string) {
  resetInvitationCaptureState();
  window.history.replaceState(null, "", hash ? `/operator/invitations#${hash}` : "/operator/invitations");
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/operator/invitations"]}>
        <Routes>
          <Route path="/operator/invitations" element={<InvitationAccept />} />
          <Route path="/" element={<p>공개 홈</p>} />
          <Route path="/login" element={<LoginSpot />} />
          <Route path="/events" element={<p>행사 목록 화면</p>} />
          <Route path="/verify-email" element={<VerifySpot />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedToken(storedAt = Date.now()) {
  localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ token: TOKEN, storedAt }));
}

async function signIn() {
  await login({ userId: localUsers[0].userId, email: "guest@example.com" });
}

function pendingBody() {
  return {
    eventName: "가을 수련회",
    role: "MANAGER",
    inviterName: "김운영",
    expiresAt: "2026-10-23T00:00:00Z",
    outcome: "PENDING",
  };
}

describe("operator invitation accept", () => {
  it("shows login guidance and does not preview while logged out", async () => {
    renderInvite(TOKEN);
    expect(
      await screen.findByRole("heading", { name: "초대를 확인하려면 로그인해 주세요" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("로그인하면 초대 내용을 보여 드려요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "사이드바 접기" })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(storedInvitationToken()).toBe(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    const spot = await screen.findByText(/로그인 자리/);
    expect(spot).toHaveTextContent("로그인 자리 /login?next=/operator/invitations");
    expect(spot.textContent).not.toContain(TOKEN);
    expect(storedInvitationToken()).toBe(TOKEN);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  });

  it("keeps the stored token when the wordmark goes home", async () => {
    renderInvite(TOKEN);
    fireEvent.click(await screen.findByRole("link", { name: "SCENE" }));
    expect(await screen.findByText("공개 홈")).toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it("sends a missing token home", async () => {
    renderInvite();
    expect(await screen.findByText("공개 홈")).toBeInTheDocument();
  });

  it("sends an expired stored token home", async () => {
    seedToken(Date.now() - 31 * 60 * 1000);
    renderInvite();
    expect(await screen.findByText("공개 홈")).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("shows the unusable link screen when storage cannot keep the token", async () => {
    seedToken();
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === INVITATION_STORAGE_KEY) throw new Error("quota");
      original.call(this, key, value);
    });
    try {
      renderInvite("replacement-token");
      expect(await screen.findByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "초대 수락" })).not.toBeInTheDocument();
      expect(storedInvitationToken()).toBeNull();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("shows the unusable link screen for a broken stored token", async () => {
    localStorage.setItem(INVITATION_STORAGE_KEY, "{");
    renderInvite();
    expect(await screen.findByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(await screen.findByText("공개 홈")).toBeInTheDocument();
    expect(localStorage.getItem(INVITATION_STORAGE_KEY)).toBeNull();
  });

  it("accepts a pending invite and opens the event list", async () => {
    let previewBody: unknown;
    let acceptBody: unknown;
    let previewUrl = "";
    server.use(
      http.post("/api/v1/operator/invitations/preview", async ({ request }) => {
        previewUrl = request.url;
        previewBody = await request.json();
        return HttpResponse.json(pendingBody());
      }),
      http.post("/api/v1/operator/invitations/accept", async ({ request }) => {
        acceptBody = await request.json();
        return HttpResponse.json({ outcome: "ACCEPTED" });
      }),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "가을 수련회 초대를 받았어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("김운영님이 Manager로 초대했어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락" }));
    expect(await screen.findByRole("heading", { name: "초대를 수락했어요" })).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
    expect(previewBody).toEqual({ token: TOKEN });
    expect(acceptBody).toEqual({ token: TOKEN });
    expect(previewUrl).not.toContain(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "행사 목록" }));
    expect(await screen.findByText("행사 목록 화면")).toBeInTheDocument();
  });

  it("opens the event list when accept reports the invite was already accepted", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () => HttpResponse.json(pendingBody())),
      http.post("/api/v1/operator/invitations/accept", () => HttpResponse.json({ outcome: "ALREADY_ACCEPTED" })),
    );
    await signIn();
    seedToken();
    renderInvite();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "이미 수락한 초대예요" })).toBeInTheDocument();
    expect(screen.getByText("행사 목록에서 이어서 볼 수 있어요.")).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "행사 목록" }));
    expect(await screen.findByText("행사 목록 화면")).toBeInTheDocument();
  });

  it("opens the event list when preview says this account already accepted", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () =>
        HttpResponse.json({ ...pendingBody(), outcome: "ALREADY_ACCEPTED" }),
      ),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "이미 수락한 초대예요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 수락" })).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("clears the token and goes home from an email mismatch", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () =>
        problem(403, "INVITATION_EMAIL_MISMATCH", { detail: SECRET }),
      ),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "초대한 이메일과 달라요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(await screen.findByText("공개 홈")).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("logs out and keeps the token when switching accounts", async () => {
    let loggedOut = false;
    server.use(
      http.post("/api/v1/operator/invitations/preview", () =>
        problem(403, "INVITATION_EMAIL_MISMATCH", { detail: SECRET }),
      ),
      http.post("/api/v1/operator/auth/logout", () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await signIn();
    seedToken();
    renderInvite();
    fireEvent.click(await screen.findByRole("button", { name: "계정 바꾸기" }, { timeout: 4000 }));
    const spot = await screen.findByText(/로그인 자리/);
    expect(spot).toHaveTextContent("로그인 자리 /login?next=/operator/invitations");
    expect(spot.textContent).not.toContain(TOKEN);
    expect(loggedOut).toBe(true);
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it.each([
    [410, "INVITATION_EXPIRED", "초대가 만료됐어요"],
    [410, "INVITATION_REVOKED", "초대가 취소됐어요"],
    [410, "INVITATION_SUPERSEDED", "새 초대로 바뀌었어요"],
    [404, "INVITATION_NOT_FOUND", "사용할 수 없는 링크예요"],
    [409, "INVITATION_ALREADY_ACCEPTED", "사용할 수 없는 링크예요"],
  ] as const)("clears the token for %s %s", async (status, code, title) => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () => problem(status, code, { detail: SECRET })),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: title }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("returns home from a revoked invite", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () =>
        problem(410, "INVITATION_REVOKED", { detail: SECRET }),
      ),
    );
    await signIn();
    seedToken();
    renderInvite();
    fireEvent.click(await screen.findByRole("button", { name: "돌아가기" }, { timeout: 4000 }));
    expect(await screen.findByText("공개 홈")).toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("keeps the token and sends an unverified email to the static check", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () =>
        problem(403, "EMAIL_NOT_VERIFIED", { detail: SECRET }),
      ),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "이메일 인증이 필요해요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "돌아가기" })).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "이메일 인증" }));
    const spot = await screen.findByText(/이메일 인증 화면/);
    expect(spot).toHaveTextContent("이메일 인증 화면 /verify-email");
    expect(spot.textContent).not.toContain(TOKEN);
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it("retries a rate limit and then shows the invite", async () => {
    let calls = 0;
    server.use(
      http.post("/api/v1/operator/invitations/preview", () => {
        calls += 1;
        if (calls === 1) return problem(429, "RATE_LIMITED", { detail: SECRET });
        return HttpResponse.json(pendingBody());
      }),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "초대를 확인하지 못했어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 })).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it("keeps the token when the event is archived", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () => problem(409, "EVENT_ARCHIVED", { detail: SECRET })),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "초대를 확인하지 못했어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it("keeps the token after a server failure", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () => problem(500, "UNEXPECTED", { detail: SECRET })),
    );
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "초대를 확인하지 못했어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it("keeps the token after a network failure", async () => {
    server.use(http.post("/api/v1/operator/invitations/preview", () => HttpResponse.error()));
    await signIn();
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "초대를 확인하지 못했어요" }, { timeout: 4000 })).toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it("returns to login and keeps the token when preview is unauthorized", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () =>
        problem(401, "AUTHENTICATION_REQUIRED", { detail: SECRET }),
      ),
    );
    await signIn();
    seedToken();
    renderInvite();
    const spot = await screen.findByText(/로그인 자리/, undefined, { timeout: 4000 });
    expect(spot.textContent).not.toContain(TOKEN);
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "초대를 확인하지 못했어요" })).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
  });

  it("clears the token when accept finds a revoked invite", async () => {
    server.use(
      http.post("/api/v1/operator/invitations/preview", () => HttpResponse.json(pendingBody())),
      http.post("/api/v1/operator/invitations/accept", () => problem(410, "INVITATION_REVOKED", { detail: SECRET })),
    );
    await signIn();
    seedToken();
    renderInvite();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 }));
    expect(await screen.findByRole("heading", { name: "초대가 취소됐어요" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBeNull();
  });

  it("does not preview when the session cannot be loaded", async () => {
    server.use(http.get("/api/v1/operator/me", () => problem(500, "UNEXPECTED", { detail: SECRET })));
    seedToken();
    renderInvite();
    expect(await screen.findByRole("heading", { name: "불러오지 못했어요." }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  });

  it("retries the session load without dropping the token", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/operator/me", () => {
        calls += 1;
        if (calls < 3) return problem(500, "UNEXPECTED");
        return HttpResponse.json({ userId: localUsers[0].userId, displayName: "Local owner" });
      }),
      http.post("/api/v1/operator/invitations/preview", () => HttpResponse.json(pendingBody())),
    );
    seedToken();
    renderInvite();
    const retry = await screen.findByRole("button", { name: "다시 시도" }, { timeout: 4000 });
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "초대 수락" }, { timeout: 4000 })).toBeInTheDocument();
    expect(storedInvitationToken()).toBe(TOKEN);
  });
});
