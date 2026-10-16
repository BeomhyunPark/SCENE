import type { EventType } from "../../api/events";
import type { DurationBucket } from "./types";

export type TaskDraft = { title: string; checklist: string[] };

const stay = (title: string): TaskDraft => ({
  title,
  checklist: ["인원 확인", "예약 확정", "안내문 반영"],
});

function draft(title: string, checklist: string[]): TaskDraft {
  return { title, checklist };
}

export const COMMON_TASKS: TaskDraft[] = [
  draft("안내문 정리", ["받을 사람 확인", "문안 작성"]),
  draft("담당자 확인", ["역할 목록", "빈 역할 확인"]),
  draft("장소 사용 확인", ["사용 시간", "준비 동선"]),
  draft("참가자 안내", ["안내 시각", "다시 안내할 내용"]),
];

export const TASK_TEMPLATES: Record<EventType, TaskDraft[]> = {
  RETREAT: [
    draft("차량 배차", ["탑승 장소", "출발 시각", "운행 담당"]),
    draft("회비 안내", ["금액", "내는 방법", "마감"]),
    draft("프로그램 순서표", ["세션 목록", "진행 담당"]),
    draft("간식 준비", ["수량", "알레르기"]),
  ],
  VISION_TRIP: [
    draft("일정표 확정", ["이동 구간", "모임 시간"]),
    draft("현지 연락처 정리", ["담당 이름", "비상 연락"]),
    draft("보험 안내", ["가입 여부", "보장 범위"]),
    draft("준비물 안내", ["필수 물품", "개인 물품"]),
  ],
  OUTREACH: [
    draft("대상 확인", ["만남 대상", "장소"]),
    draft("준비물 목록", ["나눔 물품", "수량"]),
    draft("현장 동선 확인", ["집합 장소", "이동 방법"]),
    draft("나눔 시간 정리", ["순서", "진행 담당"]),
  ],
  SHORT_TERM_MISSION: [
    draft("항공 일정 확인", ["출발", "도착", "집합"]),
    draft("준비물 안내", ["필수 서류", "개인 물품"]),
    draft("현지 일정 확인", ["사역 시간", "이동"]),
    draft("안전 안내", ["비상 연락", "주의 사항"]),
  ],
  BIBLE_SCHOOL: [
    draft("교재 준비", ["부수", "배부 방법"]),
    draft("모둠 안내", ["모둠 수", "인도자"]),
    draft("간식 준비", ["수량", "배부 시간"]),
    draft("순서표 정리", ["찬양", "말씀", "모둠"]),
  ],
  CAMP: [
    draft("프로그램 순서표", ["활동", "진행 담당"]),
    draft("안전 안내", ["비상 연락", "주의 장소"]),
    draft("간식 준비", ["수량", "배부 시간"]),
    draft("조 편성 초안", ["조 수", "인도자"]),
  ],
  WORKSHOP: [
    draft("자료 준비", ["자료 목록", "인쇄"]),
    draft("장소 세팅", ["자리", "장비"]),
    draft("참가자 안내", ["시작 시각", "올 곳"]),
    draft("시간표 정리", ["세션", "쉬는 시간"]),
  ],
  OTHER: [
    draft("목표 정리", ["이번 행사에서 끝낼 일", "담당"]),
    draft("준비물 확인", ["물품", "수량"]),
    draft("안내문 작성", ["문안", "보낼 곳"]),
    draft("역할 나누기", ["역할", "담당"]),
  ],
};

const LODGING: Partial<Record<EventType, TaskDraft[]>> = {
  RETREAT: [stay("숙소 확정")],
  VISION_TRIP: [stay("숙소 확정")],
  SHORT_TERM_MISSION: [stay("숙소 확정")],
  BIBLE_SCHOOL: [stay("숙소 확정")],
  CAMP: [stay("숙소 확정")],
};

export function draftsFor(eventType: EventType | null, bucket: DurationBucket): TaskDraft[] {
  const base = eventType ? TASK_TEMPLATES[eventType] : COMMON_TASKS;
  const overnight = bucket === "TWO_TO_THREE_DAYS" || bucket === "FOUR_PLUS_DAYS";
  const lodging = eventType && overnight ? (LODGING[eventType] ?? []) : [];
  return [...base, ...lodging];
}
