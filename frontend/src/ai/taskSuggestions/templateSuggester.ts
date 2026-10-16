import type { EventType } from "../../api/events";
import { draftsFor } from "./templates";
import type { TaskSuggester, TaskSuggestion, TaskSuggestionInput } from "./types";

const TYPES = new Set<EventType>([
  "RETREAT",
  "VISION_TRIP",
  "OUTREACH",
  "SHORT_TERM_MISSION",
  "BIBLE_SCHOOL",
  "CAMP",
  "WORKSHOP",
  "OTHER",
]);

function assertInput(input: TaskSuggestionInput): void {
  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== "durationBucket" || keys[1] !== "eventType") {
    throw new Error("suggestion input");
  }
  if (input.eventType !== null && !TYPES.has(input.eventType)) {
    throw new Error("suggestion input");
  }
}

export const templateSuggester: TaskSuggester = {
  async suggestTasks(input, options) {
    assertInput(input);
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const source = input.eventType ?? "COMMON";
    const suggestions: TaskSuggestion[] = draftsFor(input.eventType, input.durationBucket).map(
      (draft, index) => ({
        suggestionId: `${source}:${index}:${draft.title}`,
        title: draft.title,
        checklist: draft.checklist,
        source: "TEMPLATE",
      }),
    );
    return suggestions;
  },
};
