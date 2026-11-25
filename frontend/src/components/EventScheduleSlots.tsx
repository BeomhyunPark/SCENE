import { useState } from "react";
import { refillScheduleSlots, type ScheduleBoard } from "../api/schedule";
import { Button } from "./Button";
import { commonFailure } from "./scheduleAccess";

/**
 * 식사·집회 칸 on the schedule (DEC-090, C6). The form setup puts one item per 칸 in the working copy by
 * itself, so this only says so in one line, offers "식사·집회 다시 넣기" for 칸 the operator took off, and
 * names items whose 칸 left the setup. Nothing here reaches participants before a publication.
 */
export function SlotFillNote({
  eventId,
  board,
  editable,
  onDone,
}: {
  eventId: string;
  board: ScheduleBoard;
  editable: boolean;
  onDone: (notice: { tone: "success" | "info" | "error"; text: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fresh = board.items.filter((item) => item.autoFilled && item.publishState === "ADDED").length;
  const dayCount = board.days.length;
  const missing = (board.slots ?? []).filter((slot) => slot.linkedItemId === null && slot.day <= dayCount).length;
  const left = board.items.filter((item) => item.slotRemoved);
  if (fresh === 0 && (missing === 0 || !editable) && left.length === 0) return null;

  async function refill() {
    setBusy(true);
    try {
      const result = await refillScheduleSlots(eventId);
      onDone(
        result.added > 0
          ? { tone: "success", text: `식사·집회 ${result.added}개를 다시 넣었어요. 공개하면 참가자에게 보여요.` }
          : { tone: "info", text: "빠진 식사·집회가 없어요." },
      );
    } catch (error) {
      onDone({ tone: "error", text: commonFailure(error) ?? "식사·집회를 다시 넣지 못했어요. 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="event-schedule__slots" role="note" aria-label="식사·집회">
      {fresh > 0 ? <p>식사·집회 {fresh}개가 신청서 설정에서 자동으로 들어왔어요. 공개하면 참가자에게 보여요.</p> : null}
      {left.length > 0 ? (
        <p>
          신청서 설정에서 빠진 식사·집회가 남아 있어요: {left.map((item) => `${item.day}일차 ${item.title}`).join(", ")}. 필요 없으면 지워 주세요.
        </p>
      ) : null}
      {editable && missing > 0 ? (
        <p className="event-schedule__slots-action">
          <span>일정표에 없는 식사·집회 {missing}개</span>
          <Button type="button" variant="secondary" size={32} disabled={busy} onClick={() => void refill()}>
            식사·집회 다시 넣기
          </Button>
        </p>
      ) : null}
    </div>
  );
}
