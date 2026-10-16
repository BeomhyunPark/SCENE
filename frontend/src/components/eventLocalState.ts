const key = (id: string) => `scene-event-areas:${id}`;

export function readEventAreas(id: string): string[] {
  const raw = sessionStorage.getItem(key(id));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((area) => typeof area === "string") : [];
  } catch {
    return [];
  }
}

export function markEventArea(id: string, area: string): void {
  const areas = readEventAreas(id);
  if (areas.includes(area)) return;
  sessionStorage.setItem(key(id), JSON.stringify([...areas, area]));
}
