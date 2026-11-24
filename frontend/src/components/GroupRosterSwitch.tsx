import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import { getParticipantSettings, saveParticipantSettings, type ParticipantSettings } from "../api/participantSettings";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { formatPublishedAt } from "./eventFormat";

/**
 * "조원 명단 공개" (DEC-083 §2, F3 #453): whether ordinary members see their group's names, 또래 and 성별.
 * It sits on the 조 편성 screen under the publish line because it decides what the published groups
 * show to participants, next to the button that publishes them. Leaders always see their members.
 * Saving sends the version this screen read; a `409 CONCURRENT_MODIFICATION` reads the setting again
 * and says so, without saving. `EVENT_UPDATE` writes; without it the state shows without the button.
 * An archived event is read-only. A change shows on participant phones through `updates.group`.
 */
export function GroupRosterSwitch({ eventId, canWrite, status }: { eventId: string; canWrite: boolean; status: string }) {
  const queryClient = useQueryClient();
  const key = queryKeys.participantSettings(eventId);
  const settings = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getParticipantSettings(eventId, signal),
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const archived = status === "ARCHIVED";

  if (settings.isError && isApiError(settings.error) && settings.error.status === 403) return null;

  async function change(current: ParticipantSettings, next: boolean) {
    setMessage(null);
    setPending(true);
    try {
      const saved = await saveParticipantSettings(eventId, { groupRosterVisibleToMembers: next, expectedVersion: current.version });
      queryClient.setQueryData(key, saved);
    } catch (caught) {
      if (isApiError(caught, "CONCURRENT_MODIFICATION")) {
        await queryClient.invalidateQueries({ queryKey: key });
        setMessage({ tone: "info", text: "그사이 다른 운영자가 바꿔서 저장하지 않았어요. 지금 설정을 다시 불러왔어요." });
      } else {
        setMessage({ tone: "error", text: failure(caught) });
      }
    } finally {
      setPending(false);
    }
  }

  const data = settings.data;
  let state;
  if (!data) {
    state = <p>{settings.isError ? "설정을 불러오지 못했어요." : "설정을 불러오는 중이에요."}</p>;
  } else {
    const on = data.groupRosterVisibleToMembers;
    const updated = data.updatedAt ? formatPublishedAt(data.updatedAt) : "";
    state = (
      <p>
        <strong>{on ? "보여 줌" : "보여 주지 않음"}</strong> ·{" "}
        {on
          ? "조원은 같은 조 사람의 이름·또래·성별을 봐요."
          : "조원은 조 이름과 조장 이름만 봐요."}{" "}
        조장은 늘 자기 조원 명단과 도착 여부를 봐요. 연락처는 조장에게만 보여요.
        {updated ? (
          <span className="event-groups__muted">
            {" "}
            마지막 변경 {updated}
            {data.updatedByDisplayName ? ` · ${data.updatedByDisplayName}` : ""}
          </span>
        ) : null}
      </p>
    );
  }

  return (
    <section className="event-groups__roster-switch" aria-labelledby="groups-roster-switch-title">
      <div className="event-groups__roster-switch-copy">
        <h3 id="groups-roster-switch-title">조원 명단 공개</h3>
        {state}
      </div>
      {data && canWrite && !archived ? (
        <Button
          type="button"
          variant="secondary"
          size={40}
          loading={pending}
          onClick={() => void change(data, !data.groupRosterVisibleToMembers)}
        >
          {data.groupRosterVisibleToMembers ? "명단 숨기기" : "명단 보여 주기"}
        </Button>
      ) : null}
      {data && archived ? <p className="event-groups__muted">보관된 행사라 바꿀 수 없어요.</p> : null}
      {message ? (
        <p className={`event-groups__notice event-groups__notice--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

function failure(caught: unknown): string {
  if (isApiError(caught, "FORBIDDEN")) return "행사 정보를 바꿀 권한이 없어 저장하지 않았어요.";
  if (isApiError(caught, "EVENT_ARCHIVED")) return "보관된 행사라 저장하지 않았어요.";
  return "저장하지 못했어요. 다시 시도해 주세요.";
}
