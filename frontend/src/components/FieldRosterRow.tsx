import { useId } from "react";
import type { RosterItem } from "../api/checkIns";
import { ApplicantLink } from "./ApplicantLink";
import { Button } from "./Button";
import { FieldRoomLine } from "./FieldRoomLine";
import { checkInRecord } from "./fieldCheckInRecord";
import { participantLabel } from "./participantLabel";
import type { PendingRequest } from "./useCheckInQueue";
import { expectedWhen, fieldState, type FieldState } from "./fieldState";

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
  // A 도착 예정 person also says when they come ("2일차 저녁"); the badge says 도착 예정, so it is not repeated.
  const meta = [note, expectedWhen(item) ?? "", item.phoneLast4 ? `끝자리 ${item.phoneLast4}` : ""].filter(Boolean).join(" · ");
  const record = checkInRecord(item);
  const labelId = useId();
  // Spans only: on desktop this sits inside a <button>. Room (G5 #460) under the name.
  const identity = (
    <>
      {/* On desktop the name is inside the select button, so the detail panel's name opens 신청 상세 (I6). */}
      {onSelect ? (
        <span className="event-field__name" id={labelId}>
          {label}
        </span>
      ) : (
        <ApplicantLink applicationId={item.applicationId} className="event-field__name" id={labelId}>
          {label}
        </ApplicantLink>
      )}
      <FieldRoomLine room={item.room} lodging={item.lodging} />
      {meta ? <span className="event-field__meta">{meta}</span> : null}
      {record ? <span className="event-field__meta event-field__record">{record}</span> : null}
    </>
  );
  return (
    <li
      className={selected ? "event-field__row event-field__row--selected" : "event-field__row"}
      aria-labelledby={labelId}
    >
      {onSelect ? (
        <button type="button" className="event-field__row-main scene-press" aria-pressed={selected} onClick={onSelect}>
          {identity}
        </button>
      ) : (
        <div className="event-field__row-main">{identity}</div>
      )}
      <div className="event-field__row-side">
        <StatusChip state={fieldState(item)} unknown={unknown} />
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

/**
 * Pill chip of the participant item: a check for 도착, an empty circle for 미도착, and a quieter pill with no
 * mark for 도착 예정 (not late yet). Checked in is always 도착, early or not (user decision 2026-11-26).
 */
export function StatusChip({ state, unknown }: { state: FieldState; unknown: boolean }) {
  if (unknown) return <span className="event-field__badge event-field__badge--unknown">확인 안 됨</span>;
  if (state === "arrived") {
    return (
      <span className="event-field__badge event-field__badge--done">
        <span className="event-field__badge-check" aria-hidden="true" />
        도착
      </span>
    );
  }
  if (state === "expected") return <span className="event-field__badge event-field__badge--expected">도착 예정</span>;
  return (
    <span className="event-field__badge">
      <span className="event-field__badge-dot" aria-hidden="true" />
      미도착
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
