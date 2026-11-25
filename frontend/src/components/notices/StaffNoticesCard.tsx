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
  return (
    <section className="staff-notices" aria-labelledby="staff-notices-title">
      <div className="staff-notices__head">
        <h2 id="staff-notices-title">운영진 공지</h2>
        <Link className="staff-notices__more" to={noticesHref(eventId)}>
          모두 보기
        </Link>
      </div>
      {notices.isPending ? <p className="notices__support">불러오는 중이에요.</p> : null}
      {notices.isError ? <p className="notices__support">운영진 공지를 불러오지 못했어요.</p> : null}
      {notices.isSuccess && items.length === 0 ? <p className="notices__support">운영진에게 남긴 공지가 없어요.</p> : null}
      {items.length > 0 ? (
        <ul className="staff-notices__rows">
          {items.map((notice) => (
            <li key={notice.noticeId}>
              <Link className={`staff-notices__row${notice.important ? " notice-row--important" : ""}`} to={noticesHref(eventId, notice.noticeId)}>
                <span className="notice-row__title">
                  {notice.important ? <span className="notice-badge notice-badge--important">중요</span> : null}
                  {notice.title}
                </span>
                <span className="notice-row__meta">
                  {noticeStamp(notice.publishedAt)}
                  {notice.editedAt ? " · 수정됨" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
