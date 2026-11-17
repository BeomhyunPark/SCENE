/**
 * Working-copy group per participant for the 참가 현황 table mock (#308). The 편성판 mock (#301) owns
 * group editing; this is only the read the table needs, filled by tests and the demo seed.
 */
type Assigned = { groupId: string; name: string; leader: boolean };

let assignments = new Map<string, Assigned>();

export function resetTableGroupStore(): void {
  assignments = new Map();
}

export function assignTableGroup(eventId: string, participantId: string, group: Assigned | null): void {
  const key = `${eventId}|${participantId}`;
  if (group) assignments.set(key, group);
  else assignments.delete(key);
}

export function tableGroupOf(eventId: string, participantId: string): Assigned | null {
  return assignments.get(`${eventId}|${participantId}`) ?? null;
}
