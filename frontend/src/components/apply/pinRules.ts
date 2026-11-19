/**
 * The six-digit number a participant chooses (DEC-078 §2). The server checks the same rules and
 * answers `PARTICIPANT_PIN_WEAK`; this copy only lets the screen say why before sending.
 */
export function pinProblem(pin: string, phone: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "숫자 6자리를 넣어 주세요.";
  const steps = [...pin].slice(1).map((digit, index) => Number(digit) - Number(pin[index]));
  if (steps.every((step) => step === 0)) return "같은 숫자만 반복한 번호는 쓸 수 없어요.";
  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) return "이어지는 숫자는 쓸 수 없어요.";
  if (phone.replace(/\D/g, "").includes(pin)) return "전화번호에 들어 있는 숫자는 쓸 수 없어요.";
  return null;
}

/** Keeps only digits, at most six. */
export function pinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}
