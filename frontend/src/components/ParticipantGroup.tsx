import { useQuery } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import { getParticipantGroup, type ParticipantGroup as GroupState } from "../api/participantGroup";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { formatPublishedAt } from "./eventFormat";
import { participantLabel } from "./participantLabel";
import "./ParticipantGroup.css";

/**
 * "내 조" from the latest publication (#303, DEC-072), laid out after Figma P18 · group · 내 조 (667:75530)
 * and P18 · unpublished · 내 조 (667:75584). It sits under the arrival QR so the QR stays first on the day.
 * A republish can move people, so coming back to the tab reloads and "새로 고침" reloads on demand. The value
 * lives only in the query cache and is never written to web storage. Wording is a draft.
 */
export function ParticipantGroup({ eventId, name }: { eventId: string; name: string }) {
  const query = useQuery({
    queryKey: queryKeys.participantGroup(eventId),
    queryFn: ({ signal }) => getParticipantGroup(signal),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });

  // A withdrawn application has no group to show; the arrival area already explains the withdrawal.
  if (query.data?.status === "NOT_ELIGIBLE") return null;

  const refresh = (
    <Button
      type="button"
      variant="secondary"
      size={40}
      loading={query.isFetching}
      onClick={() => void reloadQuery(query)}
    >
      새로 고침
    </Button>
  );

  let body;
  if (query.isPending) {
    body = <p className="participant-gate__body">내 조를 불러오는 중이에요.</p>;
  } else if (query.isError && !query.data) {
    body = <p className="participant-gate__body">{errorText(query.error)}</p>;
  } else {
    body = <GroupBody data={query.data!} name={name} />;
  }

  return (
    <section className="participant-group" aria-labelledby="participant-group-title">
      <h2 id="participant-group-title" className="participant-group__heading">
        내 조
      </h2>
      {body}
      {query.isError && query.data ? (
        <p className="participant-gate__error">최신 조를 불러오지 못했어요. 연결을 확인하고 다시 눌러 주세요.</p>
      ) : null}
      {refresh}
    </section>
  );
}

function GroupBody({ data, name }: { data: GroupState; name: string }) {
  if (data.status === "NOT_PUBLISHED") {
    return (
      <Notice title="조 안내가 아직 열리지 않았어요" body="공개되면 이 화면에서 확인할 수 있어요." />
    );
  }
  if (data.status === "UNASSIGNED" || !data.group) {
    return (
      <>
        <Notice title="아직 조가 정해지지 않았어요" body="조가 정해지면 이 화면에서 확인할 수 있어요." />
        <UpdatedAt at={data.publishedAt} />
      </>
    );
  }
  const leaders = data.group.leaders.map((item) => item.name).filter((item) => item.trim().length > 0);
  return (
    <>
      <div className="participant-group__summary">
        {name ? <p className="participant-group__owner">{name}님의 조</p> : null}
        <p className="participant-group__name">{data.group.name}</p>
        <p className="participant-group__leaders">
          {leaders.length > 0 ? (
            <>
              조장<span className="participant-group__gap" aria-hidden="true" />
              {leaders.join(", ")}
            </>
          ) : (
            "조장은 아직 정해지지 않았어요"
          )}
        </p>
      </div>
      {data.leader ? <Roster members={data.members ?? []} /> : null}
      <UpdatedAt at={data.publishedAt} />
    </>
  );
}

function Roster({ members }: { members: NonNullable<GroupState["members"]> }) {
  return (
    <div className="participant-group__roster">
      <h3 className="participant-group__roster-title">우리 조 {members.length}명</h3>
      <ul className="participant-group__members" aria-label="우리 조 조원">
        {members.map((member, index) => (
          <li key={`${index}-${member.name}`} className="participant-group__member">
            <span>{participantLabel(member)}</span>
            {member.leader ? <span className="participant-group__badge">조장</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="participant-group__notice">
      <p className="participant-group__notice-title">{title}</p>
      <p className="participant-group__notice-body">{body}</p>
    </div>
  );
}

function UpdatedAt({ at }: { at: string | null }) {
  const text = at ? formatPublishedAt(at) : "";
  return text ? <p className="participant-group__updated">{text} 기준</p> : null;
}

function errorText(error: unknown): string {
  if (isApiError(error, "AUTHENTICATION_REQUIRED")) return "링크로 다시 들어와 주세요.";
  return "내 조를 불러오지 못했어요.";
}
