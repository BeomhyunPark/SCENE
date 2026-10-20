import { useNavigate } from "react-router";
import { reloadQuery } from "../api/queryClient";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";
import "./SpaceSettings.css";

export function SpaceSettings() {
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
      <OperatorShell title="설정" framed>
        <div className="space-settings">
          <p className="space-settings__body">아직 들어간 조직이 없어요.</p>
        </div>
      </OperatorShell>
    );
  }

  return <SettingsBody spaceId={spaces.space.spaceId} spaceName={spaces.space.name} />;
}

function SettingsBody({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const navigate = useNavigate();
  return (
    <OperatorShell title="설정" spaceName={spaceName} framed>
      <div className="space-settings">
        <section className="space-settings__leave">
          <h2 className="space-settings__title">조직에서 나가기</h2>
          <p className="space-settings__body">
            {spaceName}에서 나가면 이 조직의 행사 목록은 더 이상 보이지 않아요. 남길 행사는 다음 화면에서 고를 수
            있어요.
          </p>
          <Button
            type="button"
            variant="danger"
            size={40}
            onClick={() => navigate(`/spaces/${spaceId}/leave`)}
          >
            조직에서 나가기
          </Button>
        </section>
      </div>
    </OperatorShell>
  );
}
