/**
 * Stand-in for the server's invitation mailer (SmtpInvitationMailer / CapturingInvitationMailer).
 * "EMAIL" mirrors a server with scene.mail.enabled=true: the link goes to the outbox and the
 * response carries no link. "LINK" mirrors a server with mail off: the link comes back once.
 */
export type MockMailDelivery = "EMAIL" | "LINK";

let delivery: MockMailDelivery = "EMAIL";
let outbox: string[] = [];

export function resetMailOutbox(): void {
  delivery = "EMAIL";
  outbox = [];
}

export function setMockMailDelivery(next: MockMailDelivery): void {
  delivery = next;
}

/** Test helper: the fragment links "mailed" so far, oldest first. */
export function mailedLinks(): string[] {
  return [...outbox];
}

/** Create and resend body for one issued invitation, as the server answers it. */
export function deliver<T extends { link: string }>(
  issued: T,
): Omit<T, "link"> & { link: string | null; delivery: MockMailDelivery } {
  outbox.push(issued.link);
  return { ...issued, link: delivery === "EMAIL" ? null : issued.link, delivery };
}
