import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { parseIssued } from "./invitations";

const BASE = { id: "i-1", role: "STAFF", status: "PENDING", expiresAt: "2026-12-02T00:00:00Z" };

describe("parseIssued", () => {
  it("reads a mailed invitation with no link", () => {
    expect(parseIssued({ ...BASE, delivery: "EMAIL", link: null })).toEqual({ ...BASE, delivery: "EMAIL", link: null });
  });

  it("reads a link-once invitation", () => {
    const link = "/operator/invitations#abcdefghijklmnopqrstuvwxyz";
    expect(parseIssued({ ...BASE, delivery: "LINK", link })).toEqual({ ...BASE, delivery: "LINK", link });
  });

  it("treats a body without delivery as link-once", () => {
    const link = "/operator/invitations#abcdefghijklmnopqrstuvwxyz";
    expect(parseIssued({ ...BASE, link })).toEqual({ ...BASE, delivery: "LINK", link });
  });

  it("rejects a mailed invitation that still carries a link, and a link-once body without one", () => {
    expect(() => parseIssued({ ...BASE, delivery: "EMAIL", link: "/operator/invitations#abc" })).toThrow(ApiError);
    expect(() => parseIssued({ ...BASE, delivery: "LINK", link: null })).toThrow(ApiError);
    expect(() => parseIssued({ ...BASE, delivery: "SMS", link: null })).toThrow(ApiError);
  });
});
