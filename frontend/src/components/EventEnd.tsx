import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import type { EventDetail } from "../api/events";
import { isApiError } from "../api/errors";
import { endEvent } from "../api/lifecycle";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { OperatorShell } from "./OperatorShell";
import { useEventOwner } from "./useEventOwner";
import "./EventFlow.css";

export function EventEnd() {
  const { eventId = "" } = useParams();
  const location = useLocation();
  const fromSettings = isFromSettings(location.state);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => (
        <EndBody event={event} spaceName={spaceName} fromSettings={fromSettings} />
      )}
    </EventScreen>
  );
}

function EndBody({
  event,
  spaceName,
  fromSettings,
}: {
  event: EventDetail;
  spaceName?: string;
  fromSettings: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const owner = useEventOwner(event.eventId);
  const [warning, setWarning] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const end = useMutation({
    mutationFn: (acknowledgeWarnings: boolean) =>
      endEvent(event.eventId, {
        expectedLifecycleVersion: event.lifecycleVersion,
        ...(acknowledgeWarnings ? { acknowledgeWarnings: true } : {}),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData<EventDetail>(queryKeys.event(event.eventId), {
        ...event,
        lifecycleStatus: result.lifecycleStatus,
        lifecycleVersion: result.lifecycleVersion,
      });
      navigate(`/events/${event.eventId}`, { replace: true });
    },
    onError: (error) => {
      const tasks = openTasks(error);
      if (tasks !== null) {
        setWarning(tasks);
        setFailed(null);
        return;
      }
      if (isApiError(error) && error.status === 403) {
        setFailed("forbidden");
        return;
      }
      if (isApiError(error, "CONCURRENT_MODIFICATION")) {
        setFailed("conflict");
        return;
      }
      setFailed("retry");
    },
  });

  if (event.lifecycleStatus === "ENDED" || event.lifecycleStatus === "ARCHIVED") {
    return <Navigate to={`/events/${event.eventId}`} replace />;
  }

  const shell = (children: ReactNode) => (
    <OperatorShell title={event.name} spaceName={spaceName} eventName={event.name} eventHref={`/events/${event.eventId}`} framed>
      <div className="event-flow">{children}</div>
    </OperatorShell>
  );

  if (owner.isPending || end.isPending) {
    return shell(<p className="event-flow__body">불러오는 중이에요.</p>);
  }
  if (owner.isError) {
    return shell(
      <>
        <h2 className="event-flow__title">불러오지 못했어요</h2>
        <Button type="button" variant="secondary" size={40} onClick={() => owner.reload()}>
          다시 시도
        </Button>
      </>,
    );
  }
  if (!owner.isOwner || failed === "forbidden") {
    return shell(
      <>
        <h2 className="event-flow__title">행사를 종료할 수 없어요</h2>
        <p className="event-flow__body">행사 Owner만 종료할 수 있어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => navigate(`/events/${event.eventId}/settings`)}>
          돌아가기
        </Button>
      </>,
    );
  }
  if (!fromSettings) {
    return <Navigate to={`/events/${event.eventId}/settings`} replace />;
  }
  if (event.lifecycleStatus !== "ACTIVE") {
    return shell(
      <>
        <h2 className="event-flow__title">지금은 종료할 수 없어요</h2>
        <p className="event-flow__body">진행 중인 행사만 종료할 수 있어요.</p>
        <Button type="button" variant="secondary" size={40} onClick={() => navigate(`/events/${event.eventId}/settings`)}>
          돌아가기
        </Button>
      </>,
    );
  }
  if (failed === "conflict") {
    return shell(
      <>
        <h2 className="event-flow__title">다른 변경이 먼저 반영됐어요</h2>
        <p className="event-flow__body">행사를 다시 불러온 뒤 종료해 주세요.</p>
        <Button
          type="button"
          variant="secondary"
          size={40}
          onClick={() => {
            setFailed(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.event(event.eventId) });
          }}
        >
          다시 불러오기
        </Button>
      </>,
    );
  }

  const stay = () => navigate(`/events/${event.eventId}/settings`);
  return shell(
    <>
      <h2 className="event-flow__title">{warning === null ? "행사를 종료할까요?" : "끝내지 않은 업무가 있어요"}</h2>
      <p className="event-flow__body">
        {warning === null
          ? "종료하면 이 행사는 종료 상태가 돼요."
          : `열린 업무 ${warning}건이 남아 있어요. 종료해도 그 업무는 지워지지 않아요.`}
      </p>
      {failed === "retry" ? <p className="event-flow__body">종료하지 못했어요. 잠시 후 다시 시도해 주세요.</p> : null}
      <div className="event-flow__actions">
        <Button type="button" variant="danger" size={40} onClick={() => end.mutate(warning !== null)}>
          {warning === null ? "행사 종료" : "그래도 종료"}
        </Button>
        <Button type="button" variant="secondary" size={40} onClick={stay}>
          계속 운영하기
        </Button>
      </div>
    </>,
  );
}

function isFromSettings(state: unknown): boolean {
  return isRecord(state) && state.from === "settings";
}

function openTasks(error: unknown): number | null {
  if (!isApiError(error, "CONFIRMATION_REQUIRED")) return null;
  const warnings = error.extensions.warnings;
  if (!isRecord(warnings) || typeof warnings.openTasks !== "number" || !Number.isFinite(warnings.openTasks)) {
    return 0;
  }
  return warnings.openTasks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
