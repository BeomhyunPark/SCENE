import { describe, expect, it } from "vitest";
import { toDurationBucket } from "./durationBucket";

describe("duration bucket", () => {
  it("classifies missing, one day, short, and long ranges", () => {
    expect(toDurationBucket(null, null)).toBe("UNKNOWN");
    expect(toDurationBucket(null, "2026-10-24")).toBe("UNKNOWN");
    expect(toDurationBucket("2026-10-24", null)).toBe("UNKNOWN");
    expect(toDurationBucket("2026-10-25", "2026-10-24")).toBe("UNKNOWN");
    expect(toDurationBucket("2026-10-24", "2026-10-24")).toBe("ONE_DAY");
    expect(toDurationBucket("2026-10-24", "2026-10-25")).toBe("TWO_TO_THREE_DAYS");
    expect(toDurationBucket("2026-10-24", "2026-10-26")).toBe("TWO_TO_THREE_DAYS");
    expect(toDurationBucket("2026-10-24", "2026-10-27")).toBe("FOUR_PLUS_DAYS");
  });
});
