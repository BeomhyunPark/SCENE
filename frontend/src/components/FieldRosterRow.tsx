import { useId } from "react";
import type { RosterItem } from "../api/checkIns";
import { Button } from "./Button";
import { FieldRoomLine } from "./FieldRoomLine";
import { arrivalLine } from "./fieldArrival";
import { checkInRecord } from "./fieldCheckInRecord";
import { participantLabel } from "./participantLabel";
import type { PendingRequest } from "./useCheckInQueue";

/**
 * One participant card of 현장 운영 (#285), shared by the 전체 list and the 조별 view (#288). Follows
 * `SCENE / Field / Participant Item` (Figma 616:3971, used in OM01 622:7 and TL01 620:7): name, meta and the
 * check-in record on the left, the status chip on the right. The check-in button stays on
 * the card so one tap still checks a person in. On desktop (TL01) the name area also selects the card for
 * the detail panel, and the row's button turns quiet (a text button) so the panel's is the one main
 * button on screen (#485). Rows are list rows split by hairlines, not boxes (EventField.css).
 */
export function FieldRosterRow({
  item,
  disabled,
  request,
  onCheckIn,
  onCancel,
  onRetry,
  note,
  selected,
  onSelect,
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
  /** Desktop only: this card is the one in the detail panel. */
  selected?: boolean;
  /** Desktop only: show this card in the detail panel. */
  onSelect?: () => void;
}) {
  const busy = request?.phase === "sending";
  const unknown = request !== undefined && !busy;
  const done = item.checkIn?.status === "CHECKED_IN";
  // 또래 is in the title ("94 김하늘"), so the line below keeps only phone last 4.
  const label = participantLabel(item);
  const meta = [note, item.phoneLast4 ? `끝자리 ${item.phoneLast4}` : ""].filter(Boolean).join(" · ");
  const record = checkInRecord(item);
  const labelId = useId();
  // 도착 예정 칸 (E4 #456): a partial attendee due later reads as 올 예정, not as late.
  const arrival = arrivalLine(item.arrival);
  // Spans only: on desktop this sits inside a <button>. Room (G5 #460) under the name, arrival (E4) under meta.
  const identity = (
    <>
      <span className="event-field__name" id={labelId}>
        {label}
      </span>
      <FieldRoomLine room={item.room} lodging={item.lodging} />
      {meta ? <span className="event-field__meta">{meta}</span> : null}
      {arrival ? (
        <span className={`event-field__arrival event-field__arrival--${arrival.tone}`}>{arrival.text}</span>
      ) : null}
      {record ? <span className="event-field__meta event-field__record">{record}</span> : null}
    </>
  );
  return (
    <li
      className={selected ? "event-field__row event-field__row--selected" : "event-field__row"}
      aria-labelledby={labelId}
    >
      {onSelect ? (
        <button type="button" className="event-field__row-main" aria-pressed={selected} onClick={onSelect}>
          {identity}
        </button>
      ) : (
        <div className="event-field__row-main">{identity}</div>
      )}
      <div className="event-field__row-side">
        <StatusChip done={done} unknown={unknown} />
        <div className="event-field__row-action">
          <RowAction
            label={label}
            quiet={onSelect !== undefined}
            done={done}
            busy={busy}
            request={unknown ? request : undefined}
            disabled={disabled}
            onCheckIn={onCheckIn}
            onCancel={onCancel}
            onRetry={onRetry}
          />
        </div>
      </div>
    </li>
  );
}

/** Pill chip of the participant item: an empty circle for 미완료, a check for 체크인 완료. */
export function StatusChip({ done, unknown }: { done: boolean; unknown: boolean }) {
  if (unknown) return <span className="event-field__badge event-field__badge--unknown">확인 안 됨</span>;
  return (
    <span className={done ? "event-field__badge event-field__badge--done" : "event-field__badge"}>
      <span className={done ? "event-field__badge-check" : "event-field__badge-dot"} aria-hidden="true" />
      {done ? "체크인 완료" : "미완료"}
    </span>
  );
}

/** The check-in, cancel or retry button for one participant. Its name always carries the person's label. */
export function RowAction({
  label,
  quiet = false,
  done,
  busy,
  request,
  disabled,
  onCheckIn,
  onCancel,
  onRetry,
}: {
  label: string;
  /**
   * A text button at 32, for a row whose person also shows in the detail panel beside it. 체크인 취소 is a
   * text button everywhere: it is the rarer action, so it does not get an outline beside each name (#485).
   */
  quiet?: boolean;
  done: boolean;
  busy: boolean;
  /** A request whose result is unknown; shown as "다시 시도". */
  request: PendingRequest | undefined;
  disabled: boolean;
  onCheckIn: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (request) {
    return (
      <Button
        type="button"
        variant="secondary"
        size={40}
        disabled={disabled || request.phase === "offline"}
        aria-label={`${label} ${request.action.kind === "cancel" ? "체크인 취소" : "체크인"} 다시 시도`}
        onClick={onRetry}
      >
        다시 시도
      </Button>
    );
  }
  if (done) {
    return (
      <Button
        type="button"
        variant="tertiary"
        size={quiet ? 32 : 40}
        disabled={disabled || busy}
        loading={busy}
        aria-describedby={disabled ? "field-blocked" : undefined}
        aria-label={`${label} 체크인 취소`}
        onClick={onCancel}
      >
        체크인 취소
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant={quiet ? "tertiary" : "primary"}
      size={quiet ? 32 : 40}
      disabled={disabled}
      loading={busy}
      aria-describedby={disabled ? "field-blocked" : undefined}
      aria-label={`${label} 체크인`}
      onClick={onCheckIn}
    >
      체크인
    </Button>
  );
}
