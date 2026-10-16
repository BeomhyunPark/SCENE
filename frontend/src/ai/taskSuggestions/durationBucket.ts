import type { DurationBucket } from "./types";

function utcDay(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toDurationBucket(startDate: string | null, endDate: string | null): DurationBucket {
  const start = utcDay(startDate);
  const end = utcDay(endDate);
  if (start === null || end === null || end < start) return "UNKNOWN";
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days <= 1) return "ONE_DAY";
  if (days <= 3) return "TWO_TO_THREE_DAYS";
  return "FOUR_PLUS_DAYS";
}
