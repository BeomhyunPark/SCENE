import { useNavigate } from "react-router";
import { Button } from "./Button";
import { SpacePage } from "./SpacePage";

/** Organization settings. Members and invitations moved to the 멤버 page (/members, #376). */
export function SpaceSettings() {
  return <SpacePage title="설정">{(space) => <SpaceLeaveCard {...space} />}</SpacePage>;
}

function SpaceLeaveCard({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const navigate = useNavigate();
  return (
    <section className="space-settings__leave">
      <h2 className="space-settings__title">조직에서 나가기</h2>
      <p className="space-settings__body">
        {spaceName}에서 나가면 이 조직의 행사 목록은 더 이상 보이지 않아요. 남길 행사는 다음 화면에서 고를 수
        있어요.
      </p>
      <Button type="button" variant="danger" size={40} onClick={() => navigate(`/spaces/${spaceId}/leave`)}>
        조직에서 나가기
      </Button>
    </section>
  );
}
