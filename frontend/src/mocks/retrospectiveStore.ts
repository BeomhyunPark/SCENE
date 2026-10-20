const texts = new Map<string, string>();

export function resetRetrospectiveStore(): void {
  texts.clear();
}

export function retrospectiveText(eventId: string): string | null {
  return texts.get(eventId) ?? null;
}

export function saveRetrospectiveText(eventId: string, text: string): void {
  texts.set(eventId, text);
}
