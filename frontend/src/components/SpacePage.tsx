import type { ReactNode } from "react";
import { Link } from "react-router";
import type { SpaceRole } from "../api/spaces";
import { reloadQuery } from "../api/queryClient";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";
import "./MenuPending.css";
import "./SpaceSettings.css";

export type CurrentSpace = { spaceId: string; spaceName: string; role: SpaceRole };

/**
 * Organization page frame shared by 멤버 and 설정 (#376): waits for the current space, offers 다시 시도,
 * and says so when the account has no organization yet.
 */
export function SpacePage({ title, children }: { title: string; children: (space: CurrentSpace) => ReactNode }) {
  const spaces = useCurrentSpace();

  if (spaces.isPending) {
    return <OperatorStatus busy message="불러오는 중이에요." />;
  }
  if (spaces.isError) {
    return (
      <OperatorStatus
        message="불러오지 못했어요."
        action={
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(spaces)}>
            다시 시도
          </Button>
        }
      />
    );
  }
  if (!spaces.space) {
    // An event-only collaborator, or someone who left, has no organization page (#387). Their
    // events stay on the event list under 협력 중인 행사.
    return (
      <OperatorShell title={title} framed>
        <div className="space-settings">
          <section className="space-settings__card">
            <h2 className="space-settings__title">들어간 조직이 없어요</h2>
            <p className="space-settings__body">
              {title} 화면은 조직 멤버만 써요. 운영자로 함께하는 행사는 행사 목록의 협력 중인 행사에서 열 수 있어요.
            </p>
            <Link className="menu-pending__link scene-press scene-press--text" to="/events">
              행사 목록으로
            </Link>
          </section>
        </div>
      </OperatorShell>
    );
  }
  const { spaceId, name, role } = spaces.space;
  return (
    <OperatorShell title={title} spaceName={name} framed>
      <div className="space-settings">{children({ spaceId, spaceName: name, role })}</div>
    </OperatorShell>
  );
}
