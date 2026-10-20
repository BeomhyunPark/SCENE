import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { exchangeAccessKey, releaseAccessKey, takeAccessKey } from "../accessKey";
import { isApiError } from "../api/errors";
import { getParticipantMe, logoutParticipant, openParticipantSession } from "../api/participant";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { ParticipantFrame } from "./ParticipantFrame";

export function ParticipantEnter() {
  const { eventId = "" } = useParams();
  const [accessKey] = useState(takeAccessKey);
  const [ready, setReady] = useState(accessKey === null);
  const [entryError, setEntryError] = useState<unknown>(null);
  const [left, setLeft] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.participantMe(eventId),
    queryFn: ({ signal }) => getParticipantMe(signal),
    enabled: ready && !left,
  });

  useEffect(() => {
    if (!accessKey) return;
    let cancel = false;
    exchangeAccessKey(eventId, accessKey, () => openParticipantSession(eventId, accessKey))
      .then(() => {
        releaseAccessKey();
        if (!cancel) setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancel) setEntryError(error);
      });
    return () => {
      cancel = true;
    };
  }, [accessKey, eventId]);

  if (left) {
    return (
      <ParticipantFrame title="나갔어요">
        <p className="participant-gate__body">링크로 다시 들어와 주세요.</p>
      </ParticipantFrame>
    );
  }
  if (entryError) {
    return (
      <ParticipantFrame title={entryTitle(entryError)}>
        <p className="participant-gate__body">{entryBody(entryError)}</p>
      </ParticipantFrame>
    );
  }
  if (!ready || me.isPending) {
    return (
      <ParticipantFrame title="들어가는 중이에요">
        <p className="participant-gate__body">불러오는 중이에요.</p>
      </ParticipantFrame>
    );
  }
  if (me.isError) {
    if (isApiError(me.error, "AUTHENTICATION_REQUIRED")) {
      return (
        <ParticipantFrame title="링크가 필요해요">
          <p className="participant-gate__body">링크로 다시 들어와 주세요.</p>
        </ParticipantFrame>
      );
    }
    return (
      <ParticipantFrame title="불러오지 못했어요">
        <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(me)}>
          다시 시도
        </Button>
      </ParticipantFrame>
    );
  }

  const name = me.data.name.trim();
  return (
    <ParticipantFrame title={name.length > 0 ? `${name}님, 참가 신청이 됐어요.` : "참가 신청이 됐어요."}>
      {logoutError ? <p className="participant-gate__error">나가지 못했어요. 잠시 후 다시 시도해 주세요.</p> : null}
      <Button
        type="button"
        variant="secondary"
        size={40}
        onClick={() => {
          setLogoutError(false);
          void logoutParticipant()
            .then(() => {
              queryClient.removeQueries({ queryKey: queryKeys.participantMe(eventId) });
              setLeft(true);
            })
            .catch(() => setLogoutError(true));
        }}
      >
        로그아웃
      </Button>
    </ParticipantFrame>
  );
}

function entryTitle(error: unknown): string {
  if (isApiError(error, "PARTICIPANT_ACCESS_INVALID")) return "사용할 수 없는 링크예요";
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "행사를 찾을 수 없어요";
  return "들어가지 못했어요";
}

function entryBody(error: unknown): string {
  if (isApiError(error, "PARTICIPANT_ACCESS_INVALID")) return "링크를 다시 확인해 주세요.";
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "주소를 다시 확인해 주세요.";
  return "잠시 후 다시 시도해 주세요.";
}
