import { describe, expect, it } from "vitest";
import { EDITABLE_KEYS, PERMISSION_GROUPS, isOn, overrideSummary, sameOverrides, sourceOf, toggled } from "./operatorPermissions";

const STAFF = { roleDefaults: ["CHECKIN_WRITE", "EVENT_READ"], overrides: { grants: [], revokes: [] } };

describe("operator permission editing (DEC-079)", () => {
  it("never lists EVENT_READ or the owner-only keys", () => {
    expect(EDITABLE_KEYS).not.toContain("EVENT_READ");
    expect(EDITABLE_KEYS).not.toContain("EVENT_LIFECYCLE");
    expect(EDITABLE_KEYS).not.toContain("EVENT_USER_MANAGE");
    expect(EDITABLE_KEYS).toContain("GROUP_WRITE");
    expect(new Set(EDITABLE_KEYS).size).toBe(EDITABLE_KEYS.length);
  });

  it("describes schedule and notice permissions as features that already exist (#538)", () => {
    const hints = PERMISSION_GROUPS.flatMap((group) => group.items);
    const hintOf = (key: string) => hints.find((item) => item.key === key)?.hint;
    expect(hintOf("SCHEDULE_WRITE")).toBe("일정표에서 일정을 만들고 고쳐 공개해요");
    expect(hintOf("NOTICE_WRITE")).toBe("공지를 쓰고 올리고 보관해요");
    for (const item of hints) expect(item.hint).not.toContain("열리면");
  });

  it("grants a key the role lacks and revokes a role default", () => {
    expect(toggled(STAFF, "GROUP_WRITE", true)).toEqual({ grants: ["GROUP_WRITE"], revokes: [] });
    expect(toggled(STAFF, "CHECKIN_WRITE", false)).toEqual({ grants: [], revokes: ["CHECKIN_WRITE"] });
  });

  it("turning a key back clears the override instead of adding the opposite one", () => {
    const granted = { ...STAFF, overrides: { grants: ["GROUP_WRITE"], revokes: [] } };
    expect(toggled(granted, "GROUP_WRITE", false)).toEqual({ grants: [], revokes: [] });
    const revoked = { ...STAFF, overrides: { grants: [], revokes: ["CHECKIN_WRITE"] } };
    expect(toggled(revoked, "CHECKIN_WRITE", true)).toEqual({ grants: [], revokes: [] });
  });

  it("keeps overrides of keys outside the list", () => {
    const other = { ...STAFF, overrides: { grants: ["FINANCE_READ"], revokes: [] } };
    expect(toggled(other, "DATA_EXPORT", true)).toEqual({ grants: ["DATA_EXPORT", "FINANCE_READ"], revokes: [] });
  });

  it("tells the role default apart from personal changes", () => {
    const state = { ...STAFF, overrides: { grants: ["GROUP_WRITE"], revokes: ["CHECKIN_WRITE"] } };
    expect(sourceOf(state, "GROUP_WRITE")).toBe("granted");
    expect(sourceOf(state, "CHECKIN_WRITE")).toBe("revoked");
    expect(sourceOf(STAFF, "CHECKIN_WRITE")).toBe("default");
    expect(sourceOf(STAFF, "DATA_EXPORT")).toBe("none");
    expect(isOn(state, "GROUP_WRITE")).toBe(true);
    expect(isOn(state, "CHECKIN_WRITE")).toBe(false);
    expect(overrideSummary(state)).toBe("개별 권한 1개 더함 · 1개 뺌");
    expect(overrideSummary(STAFF)).toBe("역할 기본 권한");
  });

  it("compares overrides without order", () => {
    expect(sameOverrides({ grants: ["A", "B"], revokes: [] }, { grants: ["B", "A"], revokes: [] })).toBe(true);
    expect(sameOverrides({ grants: ["A"], revokes: [] }, { grants: [], revokes: ["A"] })).toBe(false);
  });
});
