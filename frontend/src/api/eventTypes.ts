import type { EventType } from "./events";

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "RETREAT", label: "수련회" },
  { value: "VISION_TRIP", label: "비전트립" },
  { value: "OUTREACH", label: "아웃리치" },
  { value: "SHORT_TERM_MISSION", label: "단기선교" },
  { value: "BIBLE_SCHOOL", label: "성경학교" },
  { value: "CAMP", label: "캠프" },
  { value: "WORKSHOP", label: "워크숍" },
  { value: "OTHER", label: "기타" },
];

export function eventTypeLabel(type: EventType | null): string | null {
  if (type === null) return null;
  return EVENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? null;
}
