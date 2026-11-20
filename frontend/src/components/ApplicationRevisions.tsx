import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { getApplication, getApplicationRevisions, type ApplicationRevision } from "../api/applications";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { formatSubmittedAt } from "./eventFormat";
import { revisedByLabel, revisionDiff } from "./revisionDiff";
import "./ApplicationRevisions.css";

/**
 * 변경 이력 on the application detail (#437, DEC-078 §4): every revision newest first, who changed it
 * and when, and the changed questions. "변경 전후" reads that revision and the one before it and
 * shows each changed question's answer before → after, with the detail's contact rule.
 */
export function ApplicationRevisionHistory({ eventId, applicationId }: { eventId: string; applicationId: string }) {
  const revisions = useQuery({
    queryKey: queryKeys.applicationRevisions(eventId, applicationId),
    queryFn: ({ signal }) => getApplicationRevisions(eventId, applicationId, signal),
    retry: false,
  });
  const items = revisions.data ?? [];
  if (revisions.isError || items.length <= 1) return null;
  return (
    <section className="event-home__answers revisions" aria-labelledby="revisions-title">
      <div className="event-home__applicants-head">
        <h2 id="revisions-title">변경 이력</h2>
        <span className="event-home__applicant-time">{items.length - 1}번 고침</span>
      </div>
      <ol className="revisions__list">
        {items.map((item, index) => (
          <li key={item.applicationId} className="revisions__item">
            <RevisionRow eventId={eventId} item={item} previous={items[index + 1]} openHere={item.applicationId === applicationId} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function RevisionRow({
  eventId,
  item,
  previous,
  openHere,
}: {
  eventId: string;
  item: ApplicationRevision;
  previous: ApplicationRevision | undefined;
  openHere: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labels = item.changes.map((change) => change.label).join(", ");
  const panelId = `revision-${item.applicationId}`;
  return (
    <>
      <div className="revisions__head">
        <span className="revisions__number">{item.revision}번째</span>
        <span className="revisions__who">{revisedByLabel(item.revisedBy)}</span>
        <time className="revisions__time" dateTime={item.submittedAt}>
          {formatSubmittedAt(item.submittedAt)}
        </time>
        {openHere ? <span className="revisions__here">보고 있는 신청</span> : null}
      </div>
      {previous ? (
        <>
          <p className="revisions__changes">바뀐 질문: {labels || "없음"}</p>
          <div className="revisions__actions">
            <Button type="button" variant="secondary" size={32} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
              {open ? "변경 전후 닫기" : "변경 전후 보기"}
            </Button>
            {!openHere ? (
              <Link className="revisions__link" to={`/events/${eventId}/participants/${item.applicationId}`}>
                이 신청 열기
              </Link>
            ) : null}
          </div>
          {open ? <Diff id={panelId} eventId={eventId} item={item} previous={previous} /> : null}
        </>
      ) : !openHere ? (
        <Link className="revisions__link" to={`/events/${eventId}/participants/${item.applicationId}`}>
          처음 신청 열기
        </Link>
      ) : null}
    </>
  );
}

function Diff({ id, eventId, item, previous }: { id: string; eventId: string; item: ApplicationRevision; previous: ApplicationRevision }) {
  const after = useQuery({
    queryKey: queryKeys.application(eventId, item.applicationId),
    queryFn: ({ signal }) => getApplication(eventId, item.applicationId, signal),
    retry: false,
  });
  const before = useQuery({
    queryKey: queryKeys.application(eventId, previous.applicationId),
    queryFn: ({ signal }) => getApplication(eventId, previous.applicationId, signal),
    retry: false,
  });
  if (after.isPending || before.isPending) {
    return (
      <p id={id} className="revisions__status" role="status">
        불러오는 중이에요.
      </p>
    );
  }
  if (after.isError || before.isError) {
    return (
      <p id={id} className="revisions__status" role="alert">
        변경 전후를 불러오지 못했어요.
      </p>
    );
  }
  const lines = revisionDiff(item.changes, before.data, after.data);
  return (
    <dl id={id} className="revisions__diff" aria-label={`${item.revision}번째 변경 전후`}>
      {lines.map((line) => (
        <div key={line.fieldId} className="revisions__line">
          <dt>{line.label}</dt>
          <dd>
            <span className="revisions__before">
              <span className="revisions__sr">변경 전 </span>
              {line.before}
            </span>
            <span className="revisions__arrow" aria-hidden="true">
              →
            </span>
            <span className="revisions__after">
              <span className="revisions__sr">변경 후 </span>
              {line.after}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
