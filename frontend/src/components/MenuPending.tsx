import { Link } from "react-router";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { OperatorShell } from "./OperatorShell";
import "./MenuPending.css";

/**
 * Shared "준비 중" page for organization sidebar menus that have no screen yet (#264).
 * Each menu keeps its own address so the real screen can replace this one later. The menus themselves
 * are hidden until then (#495); this page answers a typed or saved address.
 */
export function MenuPending({ title }: { title: string }) {
  const { space } = useCurrentSpace();
  return (
    <OperatorShell title={title} spaceName={space?.name} framed>
      <div className="menu-pending">
        <section className="menu-pending__card">
          <h2 className="menu-pending__title">아직 준비 중이에요</h2>
          <p className="menu-pending__body">{title} 화면은 아직 만들고 있어요.</p>
          <Link className="menu-pending__link" to="/events">
            행사 목록으로
          </Link>
        </section>
      </div>
    </OperatorShell>
  );
}
