import { afterEach, describe, expect, it } from "vitest";
import { safeNext, takeLoginNext } from "./googleSignIn";

describe("google sign-in next page", () => {
  afterEach(() => sessionStorage.clear());

  it("keeps only same-site paths", () => {
    expect(safeNext("/operator/invitations")).toBe("/operator/invitations");
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it("reads the saved page once and falls back to the event list", () => {
    sessionStorage.setItem("scene.login.next", "/spaces/1/leave");
    expect(takeLoginNext()).toBe("/spaces/1/leave");
    expect(takeLoginNext()).toBe("/events");
    sessionStorage.setItem("scene.login.next", "//evil.example");
    expect(takeLoginNext()).toBe("/events");
  });
});
