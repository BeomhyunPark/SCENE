import { templateSuggester } from "./templateSuggester";
import type { TaskSuggester } from "./types";

export { toDurationBucket } from "./durationBucket";
export { templateSuggester };
export type { DurationBucket, TaskSuggester, TaskSuggestion, TaskSuggestionInput } from "./types";

export const taskSuggester: TaskSuggester = templateSuggester;
