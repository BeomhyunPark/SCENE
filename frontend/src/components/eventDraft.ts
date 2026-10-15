export type EventDraft = {
  name: string;
  type: string;
  start: string;
  end: string;
  place: string;
};

export function formatSceneDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${year}. ${Number(month)}. ${Number(day)}`;
}

export function formatKoreanDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function eventContext(draft: EventDraft): string {
  const dates = [draft.start, draft.end].filter((iso) => iso.length > 0).map(formatKoreanDate);
  const when = [...new Set(dates)].join(" – ");
  return [when, draft.place].filter((part) => part.length > 0).join(" · ");
}

const key = (id: string) => `scene-event:${id}`;

export function saveEventDraft(id: string, draft: EventDraft) {
  sessionStorage.setItem(key(id), JSON.stringify(draft));
}

export function readEventDraft(id: string): EventDraft | null {
  const raw = sessionStorage.getItem(key(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EventDraft>;
    if (typeof parsed.name !== "string") return null;
    return {
      name: parsed.name,
      type: typeof parsed.type === "string" ? parsed.type : "",
      start: typeof parsed.start === "string" ? parsed.start : "",
      end: typeof parsed.end === "string" ? parsed.end : "",
      place: typeof parsed.place === "string" ? parsed.place : "",
    };
  } catch {
    return null;
  }
}
