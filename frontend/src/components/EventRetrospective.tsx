import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getRetrospective, RETROSPECTIVE_MAX, saveRetrospective, type Retrospective } from "../api/retrospective";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { formatSubmittedAt } from "./eventFormat";
import { OperatorShell } from "./OperatorShell";
import "./EventFlow.css";

type Failure = "conflict" | "state" | "forbidden" | "length" | "retry";

export function EventRetrospective() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <RetrospectiveBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

/**
 * One shared retrospective per event (#237). Writing needs EVENT_UPDATE and an ENDED event. A save
 * sends the version it started from; a newer version on the server is a conflict, and the draft is
 * kept until the operator chooses to load the latest text.
 */
function RetrospectiveBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const queryClient = useQueryClient();
  const eventId = event.eventId;
  const retrospective = useQuery({
    queryKey: queryKeys.retrospective(eventId),
    queryFn: ({ signal }) => getRetrospective(eventId, signal),
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (input: { text: string; expectedVersion: number }) => saveRetrospective(eventId, input),
    onSuccess: (result) => {
      queryClient.setQueryData<Retrospective>(queryKeys.retrospective(eventId), result);
      setDraft(null);
      setFailure(null);
      setSaved(true);
    },
    onError: (error) => {
      setSaved(false);
      if (isApiError(error, "CONCURRENT_MODIFICATION")) setFailure("conflict");
      else if (isApiError(error, "EVENT_ARCHIVED", "INVALID_STATE_TRANSITION")) setFailure("state");
      else if (isApiError(error, "FORBIDDEN")) setFailure("forbidden");
      else if (isApiError(error, "VALIDATION_FAILED")) setFailure("length");
      else setFailure("retry");
    },
  });
  const mayWrite = permissions.data?.effective.includes("EVENT_UPDATE") ?? false;
  const canEdit = event.lifecycleStatus === "ENDED" && mayWrite;
  const stored = retrospective.data;
  const text = draft ?? stored?.text ?? "";

  function loadLatest() {
    setDraft(null);
    setFailure(null);
    void reloadQuery(retrospective);
  }

  return (
    <OperatorShell
      title={event.name}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      framed
      leading={
        <Link className="event-home__back" to={`/events/${eventId}`} aria-label="행사 홈">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-flow">
        <h2 className="event-flow__title">회고</h2>
        {retrospective.isPending ? <p className="event-flow__body">불러오는 중이에요.</p> : null}
        {retrospective.isError ? (
          <>
            <p className="event-flow__body">불러오지 못했어요.</p>
            <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(retrospective)}>
              다시 시도
            </Button>
          </>
        ) : null}
        {stored && stored.version > 0 ? (
          <p className="event-flow__meta">
            {stored.updatedAt ? formatSubmittedAt(stored.updatedAt) : ""}
            {stored.updatedByDisplayName ? ` · ${stored.updatedByDisplayName}` : ""} 저장
          </p>
        ) : null}
        {stored && canEdit ? (
          <>
            <label className="event-flow__body" htmlFor="retrospective-text">
              이 행사를 마치고 남길 내용을 적어 주세요.
            </label>
            <textarea
              id="retrospective-text"
              className="event-flow__text"
              value={text}
              maxLength={RETROSPECTIVE_MAX}
              aria-describedby="retrospective-count"
              onChange={(change) => {
                setDraft(change.target.value);
                setSaved(false);
              }}
            />
            <p id="retrospective-count" className="event-flow__meta">
              {text.length.toLocaleString("ko-KR")} / {RETROSPECTIVE_MAX.toLocaleString("ko-KR")}자
            </p>
            {failure ? (
              <p className="event-flow__alert" role="alert">
                {failureCopy(failure)}
              </p>
            ) : null}
            {failure === "conflict" ? (
              <Button type="button" variant="secondary" size={40} onClick={loadLatest}>
                최신 내용 불러오기
              </Button>
            ) : null}
            {saved ? (
              <p className="event-flow__body" role="status">
                저장했어요.
              </p>
            ) : null}
            <Button
              type="button"
              variant="primary"
              size={40}
              loading={save.isPending}
              disabled={save.isPending || failure === "conflict" || draft === null}
              onClick={() => save.mutate({ text, expectedVersion: stored.version })}
            >
              저장
            </Button>
          </>
        ) : null}
        {stored && !canEdit && stored.text ? <p className="event-flow__body event-flow__saved">{stored.text}</p> : null}
        {stored && !canEdit && !stored.text ? <p className="event-flow__body">{emptyCopy(event, mayWrite)}</p> : null}
      </div>
    </OperatorShell>
  );
}

function failureCopy(failure: Failure): string {
  if (failure === "conflict") return "다른 운영자가 먼저 저장했어요. 최신 내용을 불러온 뒤 다시 적어 주세요.";
  if (failure === "state") return "지금 행사 상태에서는 회고를 저장할 수 없어요.";
  if (failure === "forbidden") return "회고를 저장할 권한이 없어요.";
  if (failure === "length") return `회고는 ${RETROSPECTIVE_MAX.toLocaleString("ko-KR")}자까지 쓸 수 있어요.`;
  return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function emptyCopy(event: EventDetail, mayWrite: boolean): string {
  if (event.lifecycleStatus === "ACTIVE") return "다시 연 행사에는 새 회고를 쓸 수 없어요.";
  if (event.lifecycleStatus === "ARCHIVED") return "보관된 행사에는 회고를 쓸 수 없어요.";
  if (event.lifecycleStatus === "DRAFT") return "행사를 종료한 뒤에 회고를 쓸 수 있어요.";
  if (!mayWrite) return "아직 회고가 없어요.";
  return "";
}
