import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import type { EventDetail } from "../api/events";
import { getRetrospective, retrospectiveMissing, saveRetrospective } from "../api/retrospective";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import "./EventFlow.css";

export function EventRetrospective() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <RetrospectiveBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function RetrospectiveBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const queryClient = useQueryClient();
  const retrospective = useQuery({
    queryKey: queryKeys.retrospective(event.eventId),
    queryFn: ({ signal }) => getRetrospective(event.eventId, signal),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (text: string) => saveRetrospective(event.eventId, text),
    onSuccess: (text) => {
      queryClient.setQueryData(queryKeys.retrospective(event.eventId), text);
      setDraft(null);
      setFailure(null);
    },
    onError: (error) => {
      if (retrospectiveMissing(error)) {
        setFailure("missing");
        return;
      }
      setFailure("retry");
    },
  });
  const canEdit = event.lifecycleStatus === "ENDED";
  const text = draft ?? retrospective.data ?? "";

  return (
    <OperatorShell
      title={event.name}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${event.eventId}`}
      framed
      leading={
        <Link className="event-home__back" to={`/events/${event.eventId}`} aria-label="행사 홈">
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
        {retrospective.isSuccess && canEdit ? (
          <>
            <label className="event-flow__body" htmlFor="retrospective-text">
              이 행사를 마치고 남길 내용을 적어 주세요.
            </label>
            <textarea
              id="retrospective-text"
              className="event-flow__text"
              value={text}
              onChange={(change) => setDraft(change.target.value)}
            />
            {failure === "missing" ? (
              <p className="event-flow__body">회고 저장은 아직 서버에 없어요.</p>
            ) : null}
            {failure === "retry" ? <p className="event-flow__body">저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p> : null}
            <Button type="button" variant="primary" size={40} onClick={() => save.mutate(text)} disabled={save.isPending}>
              저장
            </Button>
          </>
        ) : null}
        {retrospective.isSuccess && !canEdit && retrospective.data ? (
          <p className="event-flow__body">{retrospective.data}</p>
        ) : null}
        {retrospective.isSuccess && !canEdit && !retrospective.data && event.lifecycleStatus === "ACTIVE" ? (
          <p className="event-flow__body">다시 연 행사에는 새 회고를 쓸 수 없어요.</p>
        ) : null}
        {retrospective.isSuccess && !canEdit && !retrospective.data && event.lifecycleStatus === "ARCHIVED" ? (
          <p className="event-flow__body">보관된 행사에는 회고를 쓸 수 없어요.</p>
        ) : null}
        {retrospective.isSuccess && !canEdit && !retrospective.data && event.lifecycleStatus === "DRAFT" ? (
          <p className="event-flow__body">행사를 종료한 뒤에 회고를 쓸 수 있어요.</p>
        ) : null}
      </div>
    </OperatorShell>
  );
}
