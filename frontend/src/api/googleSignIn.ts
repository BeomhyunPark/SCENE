/**
 * Google sign-in leaves the app (DEC-069). The server sends the browser back to `/login/done`,
 * which reads the page to continue to from sessionStorage. Only a same-site path is kept.
 */
export const GOOGLE_SIGN_IN_PATH = "/oauth2/authorization/google";
const NEXT_KEY = "scene.login.next";

export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function startGoogleSignIn(next: string | null): void {
  try {
    const kept = safeNext(next);
    if (kept) sessionStorage.setItem(NEXT_KEY, kept);
    else sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // Private mode: continue to the event list after sign-in.
  }
  window.location.assign(GOOGLE_SIGN_IN_PATH);
}

/** Reads and forgets the saved page. */
export function takeLoginNext(): string {
  try {
    const next = safeNext(sessionStorage.getItem(NEXT_KEY));
    sessionStorage.removeItem(NEXT_KEY);
    return next ?? "/events";
  } catch {
    return "/events";
  }
}
