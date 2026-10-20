/**
 * The access key lives in the fragment only. It is read once and removed
 * before other code can see `location.hash`. It is not written to storage.
 */
let held: string | null = null;
const exchanges = new Map<string, Promise<void>>();

export function takeAccessKey(): string | null {
  const fresh = readAndStrip();
  if (fresh !== null) {
    held = fresh;
    return fresh;
  }
  return held;
}

export function releaseAccessKey(): void {
  held = null;
  exchanges.clear();
}

export function resetAccessKeyCapture(): void {
  held = null;
  exchanges.clear();
}

/** One exchange per key so a strict remount does not post twice. */
export function exchangeAccessKey(eventId: string, accessKey: string, send: () => Promise<void>): Promise<void> {
  const id = `${eventId}\n${accessKey}`;
  const existing = exchanges.get(id);
  if (existing) return existing;
  const pending = send().then(
    () => undefined,
    (error: unknown) => {
      exchanges.delete(id);
      throw error;
    },
  );
  exchanges.set(id, pending);
  return pending;
}

function readAndStrip(): string | null {
  const hash = window.location.hash;
  if (hash.length <= 1) return null;
  const next = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(window.history.state, "", next);
  const raw = hash.slice(1);
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
