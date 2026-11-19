import type { ReactNode } from "react";
import type { SpaceRole } from "../api/spaces";
import { reloadQuery } from "../api/queryClient";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";
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
    return (
      <OperatorShell title={title} framed>
        <div className="space-settings">
          <p className="space-settings__body">아직 들어간 조직이 없어요.</p>
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
