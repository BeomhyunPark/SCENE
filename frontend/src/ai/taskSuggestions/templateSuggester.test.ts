import { describe, expect, it, vi } from "vitest";
import { taskSuggester } from ".";
import { TASK_TEMPLATES } from "./templates";

const types = [
  "RETREAT",
  "VISION_TRIP",
  "OUTREACH",
  "SHORT_TERM_MISSION",
  "BIBLE_SCHOOL",
  "CAMP",
  "WORKSHOP",
  "OTHER",
] as const;

describe("template suggester", () => {
  it("returns one or more drafts for every type and the common set", async () => {
    expect(Object.keys(TASK_TEMPLATES).sort()).toEqual([...types].sort());
    for (const eventType of types) {
      const suggestions = await taskSuggester.suggestTasks({
        eventType,
        durationBucket: "ONE_DAY",
      });
      expect(suggestions.length).toBeGreaterThan(0);
    }
    const common = await taskSuggester.suggestTasks({ eventType: null, durationBucket: "UNKNOWN" });
    expect(common.length).toBeGreaterThan(0);
    expect(common.some((item) => item.title.includes("숙소"))).toBe(false);
  });

  it("adds lodging only when the event spans more than one day", async () => {
    const day = await taskSuggester.suggestTasks({ eventType: "RETREAT", durationBucket: "ONE_DAY" });
    const stay = await taskSuggester.suggestTasks({
      eventType: "RETREAT",
      durationBucket: "FOUR_PLUS_DAYS",
    });
    expect(day.some((item) => item.title.includes("숙소"))).toBe(false);
    expect(stay.some((item) => item.title.includes("숙소"))).toBe(true);
  });

  it("rejects an input that carries anything besides type and duration", async () => {
    await expect(
      taskSuggester.suggestTasks({ eventType: "CAMP", durationBucket: "ONE_DAY", place: "홀" } as never),
    ).rejects.toThrow("suggestion input");
  });

  it("does not call fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await taskSuggester.suggestTasks({ eventType: "CAMP", durationBucket: "ONE_DAY" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
