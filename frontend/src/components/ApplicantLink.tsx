import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { ApplicantFrom } from "./applicantBack";
import "./ApplicantLink.css";

/**
 * A participant's name that opens the one 신청 상세 (`/events/:eventId/participants/:applicationId`) from
 * any screen: 현장 운영, 조 편성, 숙소 (I6 #348). The detail's back arrow returns to the screen it came
 * from. Without an application id (an older server) the name stays plain text.
 */
export function ApplicantLink({
  applicationId,
  className,
  id,
  children,
}: {
  applicationId: string | null;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const { eventId = "" } = useParams();
  const location = useLocation();
  if (!applicationId || !eventId) return (
      <span className={className} id={id}>
        {children}
      </span>
    );
  const from: ApplicantFrom = { from: `${location.pathname}${location.search}` };
  return (
    <Link
      id={id}
      className={`applicant-link scene-press scene-press--text${className ? ` ${className}` : ""}`}
      to={`/events/${eventId}/participants/${applicationId}`}
      state={from}
    >
      {children}
    </Link>
  );
}
