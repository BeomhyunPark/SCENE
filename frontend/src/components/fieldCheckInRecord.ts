import type { RosterItem } from "../api/checkIns";
import { formatSubmittedAt } from "./eventFormat";

/** "2027. 1. 15. 10:42 · Local staff · QR" for a check-in, a short line for a cancelled one. */
export function checkInRecord(item: RosterItem): string | null {
  if (item.checkIn?.status === "CHECKED_IN") {
    return [
      formatSubmittedAt(item.checkIn.checkedInAt),
      item.checkIn.checkedInByDisplayName ?? "",
      item.checkIn.method === "QR" ? "QR" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (item.checkIn?.status === "CANCELLED") return "체크인을 취소했어요";
  return null;
}