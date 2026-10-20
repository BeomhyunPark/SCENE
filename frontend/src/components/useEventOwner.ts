import { useQuery } from "@tanstack/react-query";
import { listOperators } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";

export function useEventOwner(eventId: string) {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const operators = useQuery({
    queryKey: queryKeys.operators(eventId),
    queryFn: () => listOperators(eventId),
    enabled: eventId.length > 0,
  });
  const isOwner =
    me.data !== undefined &&
    (operators.data?.items.some((item) => item.userId === me.data?.userId && item.role === "OWNER") ??
      false);
  return {
    isOwner,
    isPending: me.isPending || (eventId.length > 0 && operators.isPending),
    isError: me.isError || operators.isError,
    reload() {
      return Promise.all([reloadQuery(me), reloadQuery(operators)]);
    },
  };
}
