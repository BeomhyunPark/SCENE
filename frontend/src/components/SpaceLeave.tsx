import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router";
import { isApiError } from "../api/errors";
import { leaveSpace, listEventNames, previewLeave, type LeaveEvent } from "../api/leave";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import "./SpaceLeave.css";

const BLOCKS = new Set([
  "HANDOVER_NOT_ACCEPTED",
  "LAST_OWNER",
  "OWNER_ROLE_HELD",
  "RESPONSIBILITY",
]);

export function SpaceLeave() {
  const { spaceId } = useParams();
  if (!spaceId) {
    return <Navigate to="/events" replace />;
  }
  return <LeaveFlow spaceId={spaceId} />;
}

function LeaveFlow({ spaceId }: { spaceId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const spaces = useCurrentSpace();
  const spaceName = spaces.data?.items.find((item) => item.spaceId === spaceId)?.name;
  const preview = useQuery({
    queryKey: queryKeys.leavePreview(spaceId),
    queryFn: ({ signal }) => previewLeave(spaceId, signal),
  });
  const namesNeeded = preview.isSuccess && preview.data.events.length > 0;
  const names = useQuery({
    queryKey: queryKeys.eventNames(spaceId),
    queryFn: ({ signal }) => listEventNames(spaceId, signal),
    enabled: namesNeeded,
  });
  const [step, setStep] = useState<"confirm" | "choose">("confirm");
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
  const [forced, setForced] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState(false);
  const [keptCount, setKeptCount] = useState<number | null>(null);
  const leave = useMutation({
    mutationFn: (keepEventIds: string[]) => leaveSpace(spaceId, keepEventIds),
    onSuccess: (_result, keepEventIds) => {
      setKeptCount(keepEventIds.length);
      void queryClient.invalidateQueries({ queryKey: queryKeys.spaces });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 401) {
        navigate(loginNext(spaceId), { replace: true });
        return;
      }
      if (isKeepField(error)) {
        setKept(new Set());
        setStale(true);
        setFailed(false);
        void reloadQuery(preview);
        return;
      }
      if (isApiError(error) && error.status === 409 && BLOCKS.has(error.code)) {
        setForced(error.code);
        setFailed(false);
        return;
      }
      setFailed(true);
    },
  });

  const shell = (children: ReactNode) => (
    <OperatorShell title="조직에서 나가기" spaceName={spaceName} framed>
      <div className="space-leave">{children}</div>
    </OperatorShell>
  );

  if (keptCount === 0) {
    return <Navigate to="/find-organization" replace />;
  }
  if (keptCount !== null) {
    return shell(
      <>
        <h2 className="space-leave__title">나갔어요</h2>
        <p className="space-leave__body">행사 {keptCount}개는 계속 볼 수 있어요.</p>
        <div className="space-leave__actions">
          <Button type="button" variant="primary" size={40} onClick={() => navigate("/find-organization")}>
            조직 찾기
          </Button>
        </div>
      </>,
    );
  }
  if (preview.isPending || (namesNeeded && names.isPending) || leave.isPending) {
    return shell(
      <p className="space-leave__body" aria-live="polite" aria-busy="true">
        불러오는 중이에요.
      </p>,
    );
  }
  if (preview.isError) {
    if (isApiError(preview.error) && preview.error.status === 401) {
      return <Navigate to={loginNext(spaceId)} replace />;
    }
    if (isApiError(preview.error, "NOT_A_MEMBER")) {
      return shell(
        <>
          <h2 className="space-leave__title">이 조직의 멤버가 아니에요</h2>
          <div className="space-leave__actions">
            <Button type="button" variant="primary" size={40} onClick={() => navigate("/find-organization")}>
              조직 찾기
            </Button>
          </div>
        </>,
      );
    }
    return shell(
      <>
        <h2 className="space-leave__title">불러오지 못했어요</h2>
        <div className="space-leave__actions">
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(preview)}>
            다시 시도
          </Button>
        </div>
      </>,
    );
  }
  if (namesNeeded && names.isError) {
    return shell(
      <>
        <h2 className="space-leave__title">불러오지 못했어요</h2>
        <div className="space-leave__actions">
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(names)}>
            다시 시도
          </Button>
        </div>
      </>,
    );
  }

  const data = preview.data;
  const reason = forced ?? (data.leaveBlocked ? data.blockReason : null);
  const submit = (events: LeaveEvent[]) => {
    setFailed(false);
    leave.mutate(keepIds(events, kept));
  };

  if (reason && reason !== "OWNER_ROLE_HELD") {
    return shell(
      <BlockNotice
        reason={reason}
        events={data.events}
        names={names.data ?? {}}
        onBack={() => navigate("/events")}
      />,
    );
  }
  if (reason === "OWNER_ROLE_HELD") {
    return shell(
      <>
        <h2 className="space-leave__title">Owner를 넘겨야 나갈 수 있어요</h2>
        <p className="space-leave__body">Owner인 행사가 있으면 이 조직에서 나갈 수 없어요.</p>
        <EventChoices events={data.events} names={names.data ?? {}} kept={kept} onToggle={setKept} />
        <div className="space-leave__actions">
          <Button type="button" variant="secondary" size={40} onClick={() => navigate("/events")}>
            돌아가기
          </Button>
        </div>
      </>,
    );
  }
  if (data.events.length === 0) {
    return shell(
      <>
        <h2 className="space-leave__title">조직에서 나갈까요?</h2>
        <p className="space-leave__body">참여 중인 행사가 없어요. 나가면 이 조직에서 빠져요.</p>
        {failed ? <p className="space-leave__body">나가지 못했어요. 잠시 후 다시 시도해 주세요.</p> : null}
        <div className="space-leave__actions">
          <Button type="button" variant="danger" size={40} onClick={() => submit([])}>
            나가기
          </Button>
          <Button type="button" variant="secondary" size={40} onClick={() => navigate("/events")}>
            취소
          </Button>
        </div>
      </>,
    );
  }
  if (step === "confirm") {
    return shell(
      <>
        <h2 className="space-leave__title">조직에서 나갈까요?</h2>
        <p className="space-leave__body">남길 행사를 고른 뒤 나가요.</p>
        <div className="space-leave__actions">
          <Button type="button" variant="primary" size={40} onClick={() => setStep("choose")}>
            계속
          </Button>
          <Button type="button" variant="secondary" size={40} onClick={() => navigate("/events")}>
            취소
          </Button>
        </div>
      </>,
    );
  }

  const count = keepIds(data.events, kept).length;
  return shell(
    <>
      <h2 className="space-leave__title">어떤 행사를 계속 볼까요?</h2>
      <p className="space-leave__body">그만 보기를 고르면 그 행사에서도 나가요.</p>
      {stale ? (
        <p className="space-leave__body">선택할 수 없는 행사가 있어요. 다시 확인해 주세요.</p>
      ) : null}
      {failed ? <p className="space-leave__body">나가지 못했어요. 잠시 후 다시 시도해 주세요.</p> : null}
      <EventChoices events={data.events} names={names.data ?? {}} kept={kept} onToggle={setKept} />
      <div className="space-leave__actions">
        <Button type="button" variant="danger" size={40} onClick={() => submit(data.events)}>
          {leaveLabel(count)}
        </Button>
        <Button type="button" variant="secondary" size={40} onClick={() => setStep("confirm")}>
          취소
        </Button>
      </div>
    </>,
  );
}

function BlockNotice({
  reason,
  events,
  names,
  onBack,
}: {
  reason: string;
  events: LeaveEvent[];
  names: Record<string, string>;
  onBack: () => void;
}) {
  const open = events.filter((event) => event.openTasks > 0);
  const openCount = open.reduce((sum, event) => sum + event.openTasks, 0);
  const title =
    reason === "HANDOVER_NOT_ACCEPTED"
      ? "인계 수락을 기다리고 있어요"
      : reason === "LAST_OWNER"
        ? "마지막 Owner예요"
        : reason === "RESPONSIBILITY"
          ? openCount >= 4
            ? "맡은 업무가 4건 이상이에요"
            : "맡은 업무가 남아 있어요"
          : "지금은 나갈 수 없어요";
  const body =
    reason === "HANDOVER_NOT_ACCEPTED"
      ? "상대가 받기 전에는 나갈 수 없어요."
      : reason === "LAST_OWNER"
        ? "다른 Owner가 있어야 이 조직에서 나갈 수 있어요."
        : reason === "RESPONSIBILITY"
          ? "업무를 마치기 전에는 나갈 수 없어요."
          : "잠시 후 다시 시도해 주세요.";
  return (
    <>
      <h2 className="space-leave__title">{title}</h2>
      <p className="space-leave__body">{body}</p>
      {reason === "RESPONSIBILITY" ? (
        <ul className="space-leave__tasks">
          {open.map((event) => (
            <li key={event.eventId}>
              {eventName(event.eventId, names)} · {event.openTasks}건
            </li>
          ))}
        </ul>
      ) : null}
      <div className="space-leave__actions">
        <Button type="button" variant="secondary" size={40} onClick={onBack}>
          돌아가기
        </Button>
      </div>
    </>
  );
}

function EventChoices({
  events,
  names,
  kept,
  onToggle,
}: {
  events: LeaveEvent[];
  names: Record<string, string>;
  kept: ReadonlySet<string>;
  onToggle: (next: ReadonlySet<string>) => void;
}) {
  return (
    <ul className="space-leave__events">
      {events.map((event) => {
        const fixed = locked(event);
        const staying = !fixed && kept.has(event.eventId);
        const name = eventName(event.eventId, names);
        return (
          <li key={event.eventId} className="space-leave__event">
            <p className="space-leave__name">{name}</p>
            <p className="space-leave__note">
              {staying ? "이 행사만 계속 볼 수 있어요." : "이 행사에서도 나가요."}
            </p>
            {event.handoverAccepted ? <p className="space-leave__note">그만 보기로 고정돼요.</p> : null}
            {event.isOwner && !event.handoverAccepted ? (
              <p className="space-leave__note">Owner를 넘겨야 나갈 수 있어요.</p>
            ) : null}
            <div className="space-leave__choices" role="radiogroup" aria-label={name}>
              <label className="space-leave__choice">
                <input
                  type="radio"
                  name={`leave-${event.eventId}`}
                  checked={staying}
                  disabled={fixed}
                  onChange={() => onToggle(toggleKept(kept, event.eventId, true))}
                />
                계속 보기
              </label>
              <label className="space-leave__choice">
                <input
                  type="radio"
                  name={`leave-${event.eventId}`}
                  checked={!staying}
                  disabled={fixed}
                  onChange={() => onToggle(toggleKept(kept, event.eventId, false))}
                />
                그만 보기
              </label>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function locked(event: LeaveEvent): boolean {
  return event.isOwner || event.handoverAccepted;
}

function keepIds(events: LeaveEvent[], kept: ReadonlySet<string>): string[] {
  return events.filter((event) => !locked(event) && kept.has(event.eventId)).map((event) => event.eventId);
}

function toggleKept(kept: ReadonlySet<string>, eventId: string, stay: boolean): ReadonlySet<string> {
  const next = new Set(kept);
  if (stay) {
    next.add(eventId);
  } else {
    next.delete(eventId);
  }
  return next;
}

function leaveLabel(count: number): string {
  if (count === 0) {
    return "모두 나가기";
  }
  return `행사 ${count}개는 남기고 나가기`;
}

function eventName(eventId: string, names: Record<string, string>): string {
  return names[eventId] ?? "이름을 불러오지 못했어요";
}

function loginNext(spaceId: string): string {
  return `/login?next=${encodeURIComponent(`/spaces/${spaceId}/leave`)}`;
}

function isKeepField(error: unknown): boolean {
  return (
    isApiError(error, "VALIDATION_FAILED") &&
    (error.errors?.some((item) => item.field === "keepEventIds") ?? false)
  );
}
