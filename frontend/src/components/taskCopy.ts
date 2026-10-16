import type { BlockedReason, TaskStatus } from "../api/tasks";

export function taskStatusLabel(status: TaskStatus): string {
  if (status === "TODO") return "할 일";
  if (status === "DOING") return "진행 중";
  if (status === "DONE") return "완료";
  return "취소됨";
}

export function blockedCopy(reason: BlockedReason): string | null {
  if (reason === "FORBIDDEN") return "이 업무를 바꿀 권한이 없어요.";
  if (reason === "EVENT_ARCHIVED") return "보관된 행사는 바꿀 수 없어요.";
  if (reason === "TASK_CANCELLED") return "취소된 업무예요.";
  if (reason === "TASK_DONE") return "완료된 업무예요. 다시 진행한 뒤 바꿀 수 있어요.";
  if (reason === "CHECKLIST_INCOMPLETE") return "체크 항목을 모두 확인해야 완료할 수 있어요.";
  return null;
}

export const taskFieldCopy: Record<string, string> = {
  title: "제목을 확인해 주세요.",
  assigneeUserId: "담당자를 확인해 주세요.",
  version: "버전을 확인해 주세요.",
  reason: "사유를 확인해 주세요.",
};
