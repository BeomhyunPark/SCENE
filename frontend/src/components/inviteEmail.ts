/**
 * The address shape the invitation APIs accept (SpaceInvitationService/EventInvitationService
 * requiredEmail): one "@" with text on both sides, no spaces, at most 320 characters. Checking it
 * before the request lets "abc" fail in the dialog instead of after a 400 (#525).
 */
export function isInvitableEmail(value: string): boolean {
  const email = value.trim();
  const at = email.indexOf("@");
  return at > 0 && at === email.lastIndexOf("@") && at < email.length - 1 && email.length <= 320 && !/\s/.test(email);
}
