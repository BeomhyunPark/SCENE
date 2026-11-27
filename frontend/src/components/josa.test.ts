import { describe, expect, it } from "vitest";
import { pickJosa, withJosa } from "./josa";

describe("withJosa", () => {
  it("picks by the final consonant of a Hangul syllable", () => {
    expect(withJosa("95 테스트가", "을/를")).toBe("95 테스트가를");
    expect(withJosa("96 테스트나", "으로/로")).toBe("96 테스트나로");
    expect(withJosa("94 박범현", "을/를")).toBe("94 박범현을");
    expect(withJosa("94 박범현", "으로/로")).toBe("94 박범현으로");
    expect(withJosa("301호", "을/를")).toBe("301호를");
    expect(withJosa("본관", "이/가")).toBe("본관이");
    expect(withJosa("1조", "은/는")).toBe("1조는");
    expect(withJosa("사랑", "과/와")).toBe("사랑과");
  });

  it("uses 로 after ㄹ and 을/이/은 otherwise for ㄹ", () => {
    expect(withJosa("1층 홀", "으로/로")).toBe("1층 홀로");
    expect(withJosa("1층 홀", "을/를")).toBe("1층 홀을");
    expect(withJosa("2층 강당", "으로/로")).toBe("2층 강당으로");
  });

  it("reads digits the way they are spoken", () => {
    expect(withJosa("301", "을/를")).toBe("301을"); // 일
    expect(withJosa("302", "을/를")).toBe("302를"); // 이
    expect(withJosa("303", "으로/로")).toBe("303으로"); // 삼
    expect(withJosa("307", "으로/로")).toBe("307로"); // 칠
    expect(withJosa("309", "이/가")).toBe("309가"); // 구
    expect(withJosa("310", "을/를")).toBe("310을"); // 십
    expect(withJosa("400", "을/를")).toBe("400을"); // 백
    expect(withJosa("3000", "을/를")).toBe("3000을"); // 천
    expect(withJosa("0", "을/를")).toBe("0을"); // 영
    expect(withJosa("1000000000000", "을/를")).toBe("1000000000000를"); // 조
  });

  it("looks past trailing brackets, quotes and spaces", () => {
    expect(withJosa("김하나(94)", "을/를")).toBe("김하나(94)를");
    expect(withJosa("\"새 조\"", "을/를")).toBe("\"새 조\"를");
    expect(withJosa("A동 ", "이/가")).toBe("A동 이");
  });

  it("reads acronyms by letter names and English words by their usual ending", () => {
    expect(withJosa("QR", "으로/로")).toBe("QR로"); // 알
    expect(withJosa("Room M", "을/를")).toBe("Room M을"); // 엠
    expect(withJosa("DJ", "이/가")).toBe("DJ가");
    expect(withJosa("Owner", "으로/로")).toBe("Owner로");
    expect(withJosa("Manager", "은/는")).toBe("Manager는");
    expect(withJosa("Staff", "으로/로")).toBe("Staff로");
    expect(withJosa("Hall", "으로/로")).toBe("Hall로");
    expect(withJosa("Room", "을/를")).toBe("Room을");
    expect(withJosa("a@example.com", "으로/로")).toBe("a@example.com으로");
  });

  it("writes both forms when the ending cannot be told", () => {
    expect(pickJosa("Book", "을/를")).toBe("을(를)");
    expect(pickJosa("chat", "으로/로")).toBe("(으)로");
    expect(pickJosa("★", "이/가")).toBe("이(가)");
    expect(pickJosa("", "은/는")).toBe("은(는)");
  });
});
