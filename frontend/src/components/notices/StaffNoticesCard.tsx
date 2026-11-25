import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { listNotices } from "../../api/notices";
import { queryKeys } from "../../api/queryKeys";
import { noticesHref, noticeStamp } from "./noticeCopy";
import "./Notices.css";

/**
 * 운영진 공지 on the operator event home (DEC-082 §5): the three latest published notices whose
 * audience is STAFF. Read on entry, on window focus and after a notice write (shared invalidation).
 */
export function StaffNoticesCard({ eventId }: { eventId: string }) {
  const notices = useQuery({
    queryKey: queryKeys.staffNotices(eventId),
    queryFn: ({ signal }) => listNotices(eventId, { status: ["PUBLISHED"], audience: ["STAFF"], limit: 3 }, signal),
  });
  const items = notices.data?.items ?? [];
  // Laid out as one of the event home's sections (EventHome.css, #485): heading, one line when empty, divided rows.
  return (
    <section className="event-home__section" aria-labelledby="staff-notices-title">
      <div className="event-home__section-head">
        <h2 id="staff-notices-title" className="event-home__section-title">
          운영진 공지
        </h2>
        <Link className="event-home__more" to={noticesHref(eventId)}>
          모두 보기
        </Link>
      </div>
      {notices.isPending ? <p className="event-home__empty">불러오는 중이에요.</p> : null}
      {notices.isError ? <p className="event-home__empty">운영진 공지를 불러오지 못했어요.</p> : null}
      {notices.isSuccess && items.length === 0 ? <p className="event-home__empty">운영진에게 남긴 공지가 없어요.</p> : null}
      {items.length > 0 ? (
        <ul className="event-home__rows">
          {items.map((notice) => (
            <li key={notice.noticeId}>
              <Link className="event-home__row" to={noticesHref(eventId, notice.noticeId)}>
                <span className="event-home__row-copy">
                  <span className="event-home__row-title">
                    {notice.important ? <span className="notice-badge notice-badge--important">중요</span> : null}
                    {notice.title}
                  </span>
                  <span className="event-home__row-meta">
                    {noticeStamp(notice.publishedAt)}
                    {notice.editedAt ? " · 수정됨" : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
