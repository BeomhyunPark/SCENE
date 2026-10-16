import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router";
import { isApiError } from "../api/errors";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { OperatorShell } from "./OperatorShell";
import "./OperatorStatus.css";

export function RequireOperator() {
  const location = useLocation();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: getMe,
  });

  if (me.isPending) {
    return <OperatorStatus busy message="불러오는 중이에요." />;
  }
  if (isApiError(me.error) && me.error.status === 401) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (me.isError) {
    return (
      <OperatorStatus
        message="불러오지 못했어요."
        action={
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(me)}>
            다시 시도
          </Button>
        }
      />
    );
  }
  return <Outlet />;
}

export function OperatorStatus({
  message,
  busy,
  action,
  spaceName,
}: {
  message: string;
  busy?: boolean;
  action?: ReactNode;
  spaceName?: string;
}) {
  return (
    <OperatorShell title="행사" spaceName={spaceName}>
      <div className="operator-status">
        <p role="status" aria-busy={busy || undefined}>
          {message}
        </p>
        {action}
      </div>
    </OperatorShell>
  );
}
