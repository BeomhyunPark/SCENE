import { Link } from "react-router";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { OperatorShell } from "./OperatorShell";
import "./MenuPending.css";

/**
 * 알림 in the organization menu (#376) outside an event (#436). Notifications are kept per event
 * (DEC-080 §7.5): the list and the unread badge are inside each event. A list that gathers every
 * event is out of scope, so this page points the operator into an event and shows no badge.
 */
export function OrgNotifications() {
  const { space } = useCurrentSpace();
  return (
    <OperatorShell title="알림" spaceName={space?.name} framed>
      <div className="menu-pending">
        <section className="menu-pending__card">
          <h2 className="menu-pending__title">알림은 행사 안에서 봐요</h2>
          <p className="menu-pending__body">
            참가자가 신청을 고치거나 취소하면 그 행사를 운영하는 사람에게 알림이 가요. 행사에 들어가면 메뉴의 알림에서 읽지 않은 알림 수와 목록을 볼 수 있어요.
          </p>
          <Link className="menu-pending__link scene-press scene-press--text" to="/events">
            행사 목록으로
          </Link>
        </section>
      </div>
    </OperatorShell>
  );
}
