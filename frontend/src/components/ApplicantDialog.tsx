import { useEffect, useId, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { getApplication } from "../api/applications";
import { isApiError } from "../api/errors";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { answerLabel, formatAnswer } from "./answerDisplay";
import { useApplicantLink, useApplicantParam } from "./applicantDialog";
import { applicantName, formatSubmittedAt } from "./eventFormat";
import { useModalFocus } from "./useModalFocus";
import "./ApplicantDialog.css";

/**
 * The one popup that shows an applicant's whole application, wherever a person is listed. Put it
 * once on a screen; it opens when the address has `?applicant=<applicationId>`.
 */
export function ApplicantDialog({ eventId }: { eventId: string }) {
  const { applicationId, close } = useApplicantParam();
  if (!applicationId) return null;
  return <Panel key={applicationId} eventId={eventId} applicationId={applicationId} onClose={close} />;
}

/**
 * A person's name that opens the popup. It is a real link, so a middle click or a copied address
 * opens the same popup. Without an application id (an old mock row) it is plain text.
 */
export function ApplicantLink({
  applicationId,
  className,
  label,
  tabIndex,
  id,
  children,
}: {
  applicationId: string | null;
  className?: string;
  tabIndex?: number;
  id?: string;
  /** Accessible name when the visible text alone is not enough. */
  label?: string;
  children: ReactNode;
}) {
  const link = useApplicantLink();
  if (!applicationId) {
    return (
      <span className={className} id={id}>
        {children}
      </span>
    );
  }
  return (
    <Link
      className={className}
      id={id}
      to={link.to(applicationId)}
      state={link.state}
      aria-label={label}
      tabIndex={tabIndex}
    >
      {children}
    </Link>
  );
}

function Panel({ eventId, applicationId, onClose }: { eventId: string; applicationId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(dialogRef, onClose);
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);
  const application = useQuery({
    queryKey: queryKeys.application(eventId, applicationId),
    queryFn: ({ signal }) => getApplication(eventId, applicationId, signal),
    retry: false,
  });
  const nameAnswer = application.data?.answers.find((answer) => answer.systemKey === "NAME");
  const nameText = typeof nameAnswer?.value.text === "string" ? nameAnswer.value.text : null;
  const title = application.data ? applicantName(nameText) : "신청 내용";

  return (
    <div
      className="applicant-dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="applicant-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="applicant-dialog__head">
          <div className="applicant-dialog__heading">
            <h2 id={titleId}>{title}</h2>
            {application.data ? (
              <p className="applicant-dialog__time">신청 {formatSubmittedAt(application.data.submittedAt)}</p>
            ) : null}
          </div>
          <button type="button" className="applicant-dialog__close" aria-label="닫기" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="applicant-dialog__body">
          {application.isPending ? <p className="applicant-dialog__note">불러오는 중이에요.</p> : null}
          {application.isError ? <Failure error={application.error} onRetry={() => reloadQuery(application)} /> : null}
          {application.data ? (
            application.data.answers.length === 0 ? (
              <p className="applicant-dialog__note">받은 답변이 없어요.</p>
            ) : (
              <dl className="applicant-dialog__answers">
                {application.data.answers.map((answer) => (
                  <div key={answer.fieldId}>
                    <dt>{answerLabel(answer)}</dt>
                    <dd>{formatAnswer(answer)}</dd>
                  </div>
                ))}
              </dl>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isApiError(error, "RESOURCE_NOT_FOUND")) {
    return (
      <p className="applicant-dialog__note" role="alert">
        신청을 찾을 수 없어요.
      </p>
    );
  }
  if (isApiError(error, "FORBIDDEN")) {
    return (
      <p className="applicant-dialog__note" role="alert">
        이 신청을 볼 권한이 없어요.
      </p>
    );
  }
  return (
    <div className="applicant-dialog__failure">
      <p className="applicant-dialog__note" role="alert">
        불러오지 못했어요.
      </p>
      <Button type="button" variant="secondary" size={40} onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}
