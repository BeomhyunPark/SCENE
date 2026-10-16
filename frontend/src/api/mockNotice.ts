const listeners = new Set<() => void>();
let seen = false;

export function noteMockResponse(headers: Headers): void {
  if (seen || headers.get("x-scene-mock") !== "unverified") {
    return;
  }
  seen = true;
  for (const listener of listeners) {
    listener();
  }
}

export function hasUnverifiedResponse(): boolean {
  return seen;
}

export function subscribeUnverified(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetMockNoticeForTests(): void {
  seen = false;
}
