import { checkInCandidates } from "./participantStore";

/**
 * Participant side of group publication, shaped like GET /api/v1/participant/group (#300, DEC-072).
 * A publication keeps participant ids only; names and 또래 are read at request time from the mock
 * applications, and withdrawn people drop out of the roster and the leader names.
 *
 * The operator group board mock (#301) is not on main yet, so this store keeps its own publications.
 * Once #301 lands, `latestPublication` should read that store's published snapshot instead (#303 note).
 */
type Publication = {
  publishedAt: string;
  groups: { name: string; members: { participantId: string; leader: boolean }[] }[];
};

const publications = new Map<string, Publication>();
const withdrawn = new Set<string>();

export function resetParticipantGroupStore(): void {
  publications.clear();
  withdrawn.clear();
}

/** Test seam and mock-click helper: replaces the latest publication of an event. */
export function publishParticipantGroups(eventId: string, publication: Publication): void {
  publications.set(eventId, structuredClone(publication));
}

/**
 * Mock-click helper: publishes every current mock applicant into groups of `size`, first person leader,
 * leaving the last applicant unassigned when there are two or more.
 */
export function publishMockGroupsFromApplicants(eventId: string, size = 4, publishedAt = new Date().toISOString()) {
  const people = checkInCandidates(eventId).map((item) => item.participantId);
  const assigned = people.length > 1 ? people.slice(0, -1) : people;
  const groups: Publication["groups"] = [];
  for (let start = 0; start < assigned.length; start += size) {
    groups.push({
      name: `${groups.length + 1}조`,
      members: assigned.slice(start, start + size).map((participantId, index) => ({ participantId, leader: index === 0 })),
    });
  }
  publishParticipantGroups(eventId, { publishedAt, groups });
  return { groups: groups.length, unassigned: people.length - assigned.length };
}

/** Test seam: the participant's application is no longer SUBMITTED. */
export function withdrawFromGroups(participantId: string): void {
  withdrawn.add(participantId);
}

export type ParticipantGroupBody = {
  status: "NOT_ELIGIBLE" | "NOT_PUBLISHED" | "UNASSIGNED" | "ASSIGNED";
  publishedAt: string | null;
  group: { name: string; leaders: { name: string }[] } | null;
  leader: boolean;
  members: { name: string; cohort: string | null; leader: boolean }[] | null;
};

export function readParticipantGroup(eventId: string, participantId: string): ParticipantGroupBody {
  const active = new Map(
    checkInCandidates(eventId)
      .filter((item) => !withdrawn.has(item.participantId))
      .map((item) => [item.participantId, item]),
  );
  const none = { group: null, leader: false, members: null };
  if (!active.has(participantId)) return { status: "NOT_ELIGIBLE", publishedAt: null, ...none };
  const publication = publications.get(eventId);
  if (!publication) return { status: "NOT_PUBLISHED", publishedAt: null, ...none };
  const group = publication.groups.find((item) => item.members.some((member) => member.participantId === participantId));
  if (!group) return { status: "UNASSIGNED", publishedAt: publication.publishedAt, ...none };
  const members = group.members.flatMap((member) => {
    const person = active.get(member.participantId);
    return person ? [{ name: person.name, cohort: person.cohort, leader: member.leader }] : [];
  });
  const leader = group.members.some((member) => member.participantId === participantId && member.leader);
  return {
    status: "ASSIGNED",
    publishedAt: publication.publishedAt,
    group: { name: group.name, leaders: members.filter((member) => member.leader).map((member) => ({ name: member.name })) },
    leader,
    members: leader ? members : null,
  };
}
