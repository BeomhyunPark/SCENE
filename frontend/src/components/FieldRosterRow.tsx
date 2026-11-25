import { useId } from "react";
import type { RosterItem } from "../api/checkIns";
import { Button } from "./Button";
import { FieldRoomLine } from "./FieldRoomLine";
import { formatSubmittedAt } from "./eventFormat";
import { arrivalLine } from "./fieldArrival";
import { participantLabel } from "./participantLabel";
import type { PendingRequest } from "./useCheckInQueue";

/** One participant row of 현장 운영 (#285), shared by the 전체 list and the 조별 view (#288). */
export function FieldRosterRow({
  item,
  disabled,
  request,
  onCheckIn,
  onCancel,
  onRetry,
  note,
}: {
  item: RosterItem;
  /** Extra words on the meta line, before phone last 4 ("2조", "조장"). */
  note?: string;
  disabled: boolean;
  /** A check-in or cancel for this participant whose result is not known yet. */
  request: PendingRequest | undefined;
  onCheckIn: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const busy = request?.phase === "sending";
  const unknown = request !== undefined && !busy;
  const done = item.checkIn?.status === "CHECKED_IN";
  const wasCancelled = item.checkIn?.status === "CANCELLED";
  // 또래 is in the title ("94 김하늘"), so the line below keeps only phone last 4.
  const label = participantLabel(item);
  const meta = [note, item.phoneLast4 ? `끝자리 ${item.phoneLast4}` : ""].filter(Boolean).join(" · ");
  const labelId = useId();
  // 도착 예정 칸 (E4 #456): a partial attendee due later reads as 올 예정, not as late.
  const arrival = arrivalLine(item.arrival);
  return (
    <li className="event-field__row" aria-labelledby={labelId}>
      <div className="event-field__row-main">
        <p className="event-field__name" id={labelId}>
          {label}
        </p>
        <FieldRoomLine room={item.room} lodging={item.lodging} />
        {meta ? <p className="event-field__meta">{meta}</p> : null}
        {arrival ? (
          <p className={`event-field__arrival event-field__arrival--${arrival.tone}`}>{arrival.text}</p>
        ) : null}
        {done && item.checkIn ? (
          <p className="event-field__meta">
            {formatSubmittedAt(item.checkIn.checkedInAt)}
            {item.checkIn.checkedInByDisplayName ? ` · ${item.checkIn.checkedInByDisplayName}` : ""}
            {item.checkIn.method === "QR" ? " · QR" : ""}
          </p>
        ) : null}
        {wasCancelled ? <p className="event-field__meta">체크인을 취소했어요</p> : null}
      </div>
      {unknown ? (
        <span className="event-field__badge event-field__badge--unknown">확인 안 됨</span>
      ) : (
        <span className={done ? "event-field__badge event-field__badge--done" : "event-field__badge"}>
          {done ? "체크인 완료" : "미완료"}
        </span>
      )}
      <div className="event-field__row-action">
        {unknown ? (
          <Button
            type="button"
            variant="secondary"
            size={48}
            disabled={disabled || request.phase === "offline"}
            aria-label={`${label} ${request.action.kind === "cancel" ? "체크인 취소" : "체크인"} 다시 시도`}
            onClick={onRetry}
          >
            다시 시도
          </Button>
        ) : done ? (
          <Button
            type="button"
            variant="danger-outline"
            size={48}
            disabled={disabled || busy}
            loading={busy}
            aria-describedby={disabled ? "field-blocked" : undefined}
            aria-label={`${label} 체크인 취소`}
            onClick={onCancel}
          >
            체크인 취소
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size={48}
            disabled={disabled}
            loading={busy}
            aria-describedby={disabled ? "field-blocked" : undefined}
            aria-label={`${label} 체크인`}
            onClick={onCheckIn}
          >
            체크인
          </Button>
        )}
      </div>
    </li>
  );
}
