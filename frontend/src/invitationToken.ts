export const INVITATION_STORAGE_KEY = "scene.invitation";
const TTL_MS = 30 * 60 * 1000;

export type InvitationCapture =
  | { status: "ready"; token: string }
  | { status: "absent" }
  | { status: "unusable" };

type StoredInvitation = { token: string; storedAt: number };

/**
 * StrictMode runs the capture twice. A failed write must stay unusable on the
 * second read, after the fragment is already gone.
 */
let captureFailed = false;

export function resetInvitationCaptureState(): void {
  captureFailed = false;
}

export function captureInvitationToken(now = Date.now()): InvitationCapture {
  const fragment = readFragment();
  if (fragment !== null) {
    captureFailed = false;
    stripFragment();
    try {
      localStorage.setItem(INVITATION_STORAGE_KEY, JSON.stringify({ token: fragment, storedAt: now }));
    } catch {
      captureFailed = true;
      try {
        localStorage.removeItem(INVITATION_STORAGE_KEY);
      } catch {
        // The new token was not stored. The link is unusable either way.
      }
      return { status: "unusable" };
    }
    return { status: "ready", token: fragment };
  }

  if (captureFailed) return { status: "unusable" };

  let raw: string | null;
  try {
    raw = localStorage.getItem(INVITATION_STORAGE_KEY);
  } catch {
    return { status: "unusable" };
  }
  if (raw === null || raw.length === 0) return { status: "absent" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unusable" };
  }
  if (!isStored(parsed)) return { status: "unusable" };
  if (now - parsed.storedAt >= TTL_MS) {
    clearInvitationToken();
    return { status: "absent" };
  }
  return { status: "ready", token: parsed.token };
}

export function clearInvitationToken(): void {
  try {
    localStorage.removeItem(INVITATION_STORAGE_KEY);
  } catch {
    // A terminal screen still leaves this page. The next visit reads storage again.
  }
}

export function storedInvitationToken(): string | null {
  try {
    const raw = localStorage.getItem(INVITATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed) ? parsed.token : null;
  } catch {
    return null;
  }
}

function readFragment(): string | null {
  const hash = window.location.hash;
  if (hash.length <= 1) return null;
  const raw = hash.slice(1);
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.trim().length > 0 ? decoded : null;
  } catch {
    return raw;
  }
}

function stripFragment(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(window.history.state, "", next);
}

function isStored(value: unknown): value is StoredInvitation {
  if (typeof value !== "object" || value === null) return false;
  const token = Reflect.get(value, "token");
  const storedAt = Reflect.get(value, "storedAt");
  return typeof token === "string" && token.length > 0 && typeof storedAt === "number" && Number.isFinite(storedAt);
}
