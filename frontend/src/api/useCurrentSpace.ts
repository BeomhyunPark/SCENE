import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import { listMySpaces, type SpaceListItem } from "./spaces";

/** The first space in name order. Switching spaces is out of scope. */
export function useCurrentSpace() {
  const query = useQuery({
    queryKey: queryKeys.spaces,
    queryFn: listMySpaces,
  });
  const space: SpaceListItem | undefined = query.data?.items[0];
  return { ...query, space };
}
