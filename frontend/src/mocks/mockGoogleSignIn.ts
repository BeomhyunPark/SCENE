import { login } from "../api/session";
import { localUsers } from "./fixtures/seed";

/**
 * The mock API cannot leave for Google, so it signs in the first sample operator
 * and lets the caller continue as if Google had sent the browser back.
 */
export async function mockGoogleSignIn(): Promise<void> {
  await login({ userId: localUsers[0].userId });
}
