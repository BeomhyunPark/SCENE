import { describe, expect, it } from "vitest";
import { addMonths, barPart, covers, dayLabel, inPeriod, monthGrid, overdue, periodText, pickedRange } from "./taskMonth";

const task = (startDate: string | null, dueDate: string | null, status: "TODO" | "DOING" | "DONE" | "CANCELLED" = "TODO") => ({ startDate, dueDate, status });

describe("task month (#475)", () => {
  it("lays a month out as six weeks from Sunday", () => {
    const days = monthGrid({ year: 2027, month: 1 });
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-12-27"); // 2027-01-01 is a Friday
    expect(days[5]).toBe("2027-01-01");
    expect(dayLabel("2027-01-22")).toBe("1월 22일 (금)");
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });

  it("puts a task on its start through due days, as one bar", () => {
    const range = task("2027-01-10", "2027-01-12");
    expect(["2027-01-09", "2027-01-10", "2027-01-11", "2027-01-12", "2027-01-13"].map((date) => covers(range, date))).toEqual([false, true, true, true, false]);
    expect(barPart(range, "2027-01-10")).toBe("start");
    expect(barPart(range, "2027-01-11")).toBe("middle");
    expect(barPart(range, "2027-01-12")).toBe("end");
    const single = task(null, "2027-01-15");
    expect(covers(single, "2027-01-15")).toBe(true);
    expect(barPart(single, "2027-01-15")).toBe("single");
    expect(covers(task(null, null), "2027-01-15")).toBe(false);
    expect(periodText(range)).toBe("1/10–1/12");
    expect(periodText(single)).toBe("~1/15");
  });

  it("marks past-due open tasks, the event period and a picked range", () => {
    expect(overdue(task(null, "2027-01-09"), "2027-01-10")).toBe(true);
    expect(overdue(task(null, "2027-01-09", "DONE"), "2027-01-10")).toBe(false);
    expect(overdue(task(null, "2027-01-10"), "2027-01-10")).toBe(false);
    expect(inPeriod("2027-01-23", { startDate: "2027-01-22", endDate: "2027-01-24" })).toBe(true);
    expect(inPeriod("2027-01-25", { startDate: "2027-01-22", endDate: "2027-01-24" })).toBe(false);
    expect(pickedRange("2027-01-14", "2027-01-11")).toEqual({ startDate: "2027-01-11", dueDate: "2027-01-14" });
  });
});

describe("week rows (#475)", () => {
  it("keeps a multi-day task on one row across the week", async () => {
    const { monthGrid, weekLanes } = await import("./taskMonth");
    const week = monthGrid({ year: 2027, month: 1 }).slice(14, 21); // 1/10 – 1/16
    const lanes = weekLanes(week, [
      { taskId: "rooms", startDate: "2027-01-11", dueDate: "2027-01-15" },
      { taskId: "cars", startDate: "2027-01-14", dueDate: "2027-01-19" },
      { taskId: "badge", startDate: null, dueDate: "2027-01-16" },
      { taskId: "later", startDate: null, dueDate: "2027-01-30" },
    ]);
    expect(lanes.get("rooms")).toBe(0);
    expect(lanes.get("cars")).toBe(1);
    // Free again on the 16th: row 0 is reused.
    expect(lanes.get("badge")).toBe(0);
    expect(lanes.has("later")).toBe(false);
  });
});
