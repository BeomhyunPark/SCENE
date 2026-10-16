import { describe, expect, it, vi } from "vitest";
import { localRuleChecker } from "./localRuleChecker";
import type { FieldPrivacyInput, PrivacyCategory } from "./types";

type OnlyLabel = keyof FieldPrivacyInput extends "label" ? true : false;

describe("local field privacy rules", () => {
  it("matches each category, including a spaced unique id", async () => {
    const cases: Array<[string, PrivacyCategory]> = [
      ["주민번호", "UNIQUE_ID"],
      ["여권번호", "UNIQUE_ID"],
      ["주민 등록 번호", "UNIQUE_ID"],
      ["건강", "SENSITIVE"],
      ["종교", "SENSITIVE"],
      ["계좌번호", "FINANCIAL"],
      ["신용카드", "FINANCIAL"],
      ["신분증", "ID_DOCUMENT"],
      ["여권사본", "ID_DOCUMENT"],
    ];
    for (const [label, category] of cases) {
      const findings = await localRuleChecker.checkFieldPrivacy({ label });
      expect(findings.map((finding) => finding.category)).toContain(category);
      expect(findings.find((finding) => finding.category === category)?.message).toBeTruthy();
    }
    const spaced = await localRuleChecker.checkFieldPrivacy({ label: "주민 등록 번호" });
    expect(spaced.find((finding) => finding.category === "UNIQUE_ID")?.matched).toBe("주민등록번호");
  });

  it("ignores ordinary questions and a single 약", async () => {
    for (const label of ["예약 시간", "약속 장소", "참석 여부", "티셔츠 사이즈", "교회 이름", "약"]) {
      expect(await localRuleChecker.checkFieldPrivacy({ label })).toEqual([]);
    }
  });

  it("does not call fetch and only accepts a label", async () => {
    const onlyLabel: OnlyLabel = true;
    expect(onlyLabel).toBe(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await localRuleChecker.checkFieldPrivacy({ label: "주민번호" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
