import { Navigate, useParams } from "react-router";
import { APPLICANT_PARAM } from "./applicantDialog";

/**
 * The old detail address (`/events/:eventId/participants/:applicationId`). The detail is now a popup
 * over the screen it was opened from, so a saved or shared old link opens the 참가 현황 table with
 * that application's popup.
 */
export function EventApplication() {
  const { eventId = "", applicationId = "" } = useParams();
  const search = new URLSearchParams({ [APPLICANT_PARAM]: applicationId }).toString();
  return <Navigate replace to={`/events/${eventId}/participants?${search}`} />;
}
