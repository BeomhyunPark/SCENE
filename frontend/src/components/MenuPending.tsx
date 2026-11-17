import { Link } from "react-router";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { OperatorShell } from "./OperatorShell";
import "./MenuPending.css";

/**
 * Shared "준비 중" page for organization sidebar menus that have no screen yet (#264).
 * Each menu keeps its own address so the real screen can replace this one later.
 * `needsEvent` marks menus whose screens live inside an event; how to pick the event is #267.
 */
export function MenuPending({ title, needsEvent = false }: { title: string; needsEvent?: boolean }) {
  const { space } = useCurrentSpace();
  return (
    <OperatorShell title={title} spaceName={space?.name} framed>
      <div className="menu-pending">
        <section className="menu-pending__card">
          <h2 className="menu-pending__title">
            {needsEvent ? "행사를 고른 뒤 쓸 수 있어요" : "아직 준비 중이에요"}
          </h2>
          <p className="menu-pending__body">
            {needsEvent
              ? `${title}는 행사 안에서 열려요. 행사 목록에서 행사를 골라 주세요.`
              : `${title} 화면은 아직 만들고 있어요.`}
          </p>
          <Link className="menu-pending__link" to="/events">
            행사 목록으로
          </Link>
        </section>
      </div>
    </OperatorShell>
  );
}
