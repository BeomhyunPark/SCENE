import { describe, expect, it } from "vitest";
import { cohortSortKey, cohortYear, compareCohort } from "./cohort";

const NOW = new Date("2026-11-17T00:00:00Z");

describe("또래 order", () => {
  it("reads two digits above this year's as 19xx and the rest as 20xx", () => {
    expect(cohortYear("88", NOW)).toBe(1988);
    expect(cohortYear("27", NOW)).toBe(1927);
    expect(cohortYear("26", NOW)).toBe(2026);
    expect(cohortYear("00", NOW)).toBe(2000);
    expect(cohortYear(" 01 ", NOW)).toBe(2001);
    expect(cohortYear("1994", NOW)).toBe(1994);
    expect(cohortYear("청년", NOW)).toBeNull();
    expect(cohortYear("100", NOW)).toBeNull();
  });

  it("orders 88, 89 … 99, 00, 01, then values that are not years", () => {
    const values = ["01", "청년", "99", "00", "88", "1995", "89", "100"];
    expect([...values].sort((a, b) => compareCohort(a, b, NOW))).toEqual(["88", "89", "1995", "99", "00", "01", "100", "청년"]);
    expect([...values].sort((a, b) => cohortSortKey(a, NOW).localeCompare(cohortSortKey(b, NOW), "ko", { numeric: true }))).toEqual([
      "88", "89", "1995", "99", "00", "01", "100", "청년",
    ]);
  });
});
