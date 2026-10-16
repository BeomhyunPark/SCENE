import type { EventType } from "../../api/events";

export type DurationBucket = "UNKNOWN" | "ONE_DAY" | "TWO_TO_THREE_DAYS" | "FOUR_PLUS_DAYS";

export type TaskSuggestionInput = {
  eventType: EventType | null;
  durationBucket: DurationBucket;
};

export type TaskSuggestion = {
  suggestionId: string;
  title: string;
  checklist: string[];
  source: "TEMPLATE";
};

export interface TaskSuggester {
  suggestTasks(
    input: TaskSuggestionInput,
    options?: { signal?: AbortSignal },
  ): Promise<TaskSuggestion[]>;
}
