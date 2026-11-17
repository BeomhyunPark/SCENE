/**
 * How 현장 운영 names a participant: 또래 then 이름 on one line, "94 박범현", the way the community calls
 * people (#287, user request 2026-11-17). Without a 또래 it is the name alone. Screen reader labels use
 * the same order. Only the check-in screens use this; server shapes and the name sort stay as they are.
 */
export function participantLabel(person: { name: string; cohort: string | null }): string {
  const cohort = person.cohort?.trim();
  return cohort ? `${cohort} ${person.name}` : person.name;
}
