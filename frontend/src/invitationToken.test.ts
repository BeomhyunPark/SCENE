import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INVITATION_STORAGE_KEY,
  captureInvitationToken,
  resetInvitationCaptureState,
  storedInvitationToken,
} from "./invitationToken";

afterEach(() => {
  resetInvitationCaptureState();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("invitation token capture", () => {
  it("keeps a failed write unusable when capture runs again", () => {
    window.history.replaceState(null, "", "/operator/invitations#fresh-token");
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === INVITATION_STORAGE_KEY) throw new Error("quota");
      original.call(this, key, value);
    });
    try {
      expect(captureInvitationToken().status).toBe("unusable");
      expect(window.location.hash).toBe("");
      expect(captureInvitationToken().status).toBe("unusable");
      expect(storedInvitationToken()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("stores an undecodable fragment as the raw text", () => {
    window.history.replaceState(null, "", "/operator/invitations#bad%zz");
    expect(captureInvitationToken()).toEqual({ status: "ready", token: "bad%zz" });
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/operator/invitations");
  });

  it("drops a token stored more than 30 minutes ago", () => {
    const storedAt = Date.now() - 31 * 60 * 1000;
    localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ token: "old-token", storedAt }));
    expect(captureInvitationToken()).toEqual({ status: "absent" });
    expect(storedInvitationToken()).toBeNull();
  });

  it("reads a token stored inside 30 minutes", () => {
    localStorage.setItem(
      INVITATION_STORAGE_KEY,
      JSON.stringify({ token: "kept-token", storedAt: Date.now() - 29 * 60 * 1000 }),
    );
    expect(captureInvitationToken()).toEqual({ status: "ready", token: "kept-token" });
  });

  it("replaces a stored token when a new fragment arrives", () => {
    localStorage.setItem(
      INVITATION_STORAGE_KEY,
      JSON.stringify({ token: "old-token", storedAt: Date.now() }),
    );
    window.history.replaceState(null, "", "/operator/invitations#new-token");
    expect(captureInvitationToken()).toEqual({ status: "ready", token: "new-token" });
    expect(storedInvitationToken()).toBe("new-token");
  });
});
