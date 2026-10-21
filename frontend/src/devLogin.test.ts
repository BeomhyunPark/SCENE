import { afterEach, describe, expect, it, vi } from "vitest";

describe("devLoginEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false when DEV is off and ignores VITE_DEV_LOGIN", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEV_LOGIN", "1");
    const { devLoginEnabled } = await import("./devLogin");
    expect(devLoginEnabled()).toBe(false);
  });

  it("is true when DEV is on", async () => {
    vi.stubEnv("DEV", true);
    const { devLoginEnabled } = await import("./devLogin");
    expect(devLoginEnabled()).toBe(true);
  });
});
