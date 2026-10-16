import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { EventDetail } from "../api/events";
import { isApiError } from "../api/errors";
import { getEvent } from "../api/events";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { useCurrentSpace } from "../api/useCurrentSpace";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import { OperatorStatus } from "./RequireOperator";

function useOperatorEvent(eventId: string) {
  return useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: () => getEvent(eventId),
    enabled: eventId.length > 0,
  });
}

export function EventScreen({
  eventId,
  children,
}: {
  eventId: string;
  children: (event: EventDetail, spaceName?: string) => ReactNode;
}) {
  const navigate = useNavigate();
  const spaces = useCurrentSpace();
  const event = useOperatorEvent(eventId);
  const spaceName = spaces.space?.name;

  if (event.isPending) {
    return <OperatorStatus busy message="불러오는 중이에요." spaceName={spaceName} />;
  }
  if (isApiError(event.error, "RESOURCE_NOT_FOUND")) {
    return (
      <OperatorShell title="행사" spaceName={spaceName}>
        <div className="operator-status">
          <p role="status">행사를 찾을 수 없어요</p>
          <Button type="button" variant="primary" size={40} onClick={() => navigate("/events")}>
            행사 목록
          </Button>
        </div>
      </OperatorShell>
    );
  }
  if (isApiError(event.error) && event.error.status === 403) {
    return (
      <OperatorShell title="행사" spaceName={spaceName}>
        <p className="operator-status" role="status">
          이 행사를 볼 수 없어요
        </p>
      </OperatorShell>
    );
  }
  if (event.isError || !event.data) {
    return (
      <OperatorStatus
        message="불러오지 못했어요."
        spaceName={spaceName}
        action={
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(event)}>
            다시 시도
          </Button>
        }
      />
    );
  }
  return children(event.data, spaceName);
}
