import { pinInput } from "./pinRules";

/**
 * The six-digit number at the end of the form (DEC-078 §2), entered twice. It is the participant's
 * own secret for coming back with name and phone; it is sent once and never shown again.
 */
export function PinFields({
  pin,
  pinAgain,
  pinError,
  againError,
  onPin,
  onPinAgain,
  title = "다시 들어올 때 쓸 숫자 6자리",
  intro = "신청을 다시 보거나 고칠 때 이름, 전화번호와 함께 넣어요. 남에게 알려 주지 마세요.",
}: {
  pin: string;
  pinAgain: string;
  pinError: string | null;
  againError: string | null;
  onPin: (next: string) => void;
  onPinAgain: (next: string) => void;
  title?: string;
  intro?: string;
}) {
  return (
    <fieldset className="participant-gate__pin">
      <legend className="participant-gate__label">{title} (필수)</legend>
      <p className="participant-gate__help">{intro} 같은 숫자 반복, 이어지는 숫자, 전화번호 속 숫자는 쓸 수 없어요.</p>
      <label className="participant-gate__label" htmlFor="apply-pin">
        숫자 6자리
      </label>
      <input
        id="apply-pin"
        className="participant-gate__input"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={pin}
        aria-invalid={pinError ? true : undefined}
        aria-describedby={pinError ? "apply-pin-error" : undefined}
        onChange={(event) => onPin(pinInput(event.target.value))}
      />
      {pinError ? (
        <p id="apply-pin-error" className="participant-gate__error">
          {pinError}
        </p>
      ) : null}
      <label className="participant-gate__label" htmlFor="apply-pin-again">
        한 번 더
      </label>
      <input
        id="apply-pin-again"
        className="participant-gate__input"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={pinAgain}
        aria-invalid={againError ? true : undefined}
        aria-describedby={againError ? "apply-pin-again-error" : undefined}
        onChange={(event) => onPinAgain(pinInput(event.target.value))}
      />
      {againError ? (
        <p id="apply-pin-again-error" className="participant-gate__error">
          {againError}
        </p>
      ) : null}
    </fieldset>
  );
}
