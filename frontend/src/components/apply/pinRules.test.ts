import { describe, expect, it } from "vitest";
import { lockWait, pinProblem } from "./pinRules";

describe("pin rules (DEC-078)", () => {
  it("names weak numbers like the server", () => {
    expect(pinProblem("730914", "010-1234-5678")).toBeNull();
    expect(pinProblem("000000", "")).toMatch(/같은 숫자/);
    expect(pinProblem("654321", "")).toMatch(/이어지는/);
    expect(pinProblem("123456", "")).toMatch(/이어지는/);
    expect(pinProblem("101234", "010-1234-5678")).toMatch(/전화번호/);
    expect(pinProblem("12345", "")).toMatch(/6자리/);
  });

  it("says how long a lock lasts in minutes or hours", () => {
    expect(lockWait(300)).toBe("5분");
    expect(lockWait(1800)).toBe("30분");
    expect(lockWait(86_400)).toBe("24시간");
    expect(lockWait(undefined)).toBe("잠시");
  });
});
