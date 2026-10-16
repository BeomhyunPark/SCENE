import { describe, expect, it } from "vitest";
import { EVENT_TYPE_OPTIONS, eventTypeLabel } from "./eventTypes";

describe("event type labels", () => {
  it("maps the eight codes to the create-screen labels", () => {
    expect(EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ["RETREAT", "수련회"],
      ["VISION_TRIP", "비전트립"],
      ["OUTREACH", "아웃리치"],
      ["SHORT_TERM_MISSION", "단기선교"],
      ["BIBLE_SCHOOL", "성경학교"],
      ["CAMP", "캠프"],
      ["WORKSHOP", "워크숍"],
      ["OTHER", "기타"],
    ]);
    expect(eventTypeLabel(null)).toBeNull();
    expect(eventTypeLabel("RETREAT")).toBe("수련회");
  });
});
