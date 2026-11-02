// Local and test only. PublicLogin loads this module through a DEV-gated dynamic import,
// so the seed users stay out of the production bundle (DEC-067).
import { login, type OperatorSession } from "./api/session";
import { localUsers } from "./mocks/fixtures/seed";

/** Seed accounts the login form accepts in development. The password is not checked. */
export const localAccounts = [
  { email: "owner@scene.local", user: localUsers[0] },
  { email: "manager@scene.local", user: localUsers[1] },
  { email: "staff@scene.local", user: localUsers[2] },
  // The seeded pending invitation targets this address (backend/docs/api.md).
  { email: "local-invite@example.com", user: localUsers[0] },
] as const;

export class UnknownLocalAccount extends Error {}

export function loginWithLocalEmail(email: string): Promise<OperatorSession> {
  const normalized = email.trim().toLowerCase();
  const account = localAccounts.find((candidate) => candidate.email === normalized);
  if (!account) {
    return Promise.reject(new UnknownLocalAccount(normalized));
  }
  return login({ userId: account.user.userId, email: account.email });
}
