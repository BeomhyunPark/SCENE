import { afterEach, describe, expect, it, vi } from "vitest";

describe("prototypeScreensEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false when DEV is off", async () => {
    vi.stubEnv("DEV", false);
    const { prototypeScreensEnabled } = await import("./prototypeScreens");
    expect(prototypeScreensEnabled()).toBe(false);
  });

  it("is true when DEV is on", async () => {
    vi.stubEnv("DEV", true);
    const { prototypeScreensEnabled } = await import("./prototypeScreens");
    expect(prototypeScreensEnabled()).toBe(true);
  });
});
