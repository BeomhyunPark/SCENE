import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "./errors";

function retry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  // The mail server may have taken the first try anyway; the operator decides whether to send again.
  if (isApiError(error, "MAIL_SEND_FAILED")) {
    return false;
  }
  return failureCount < 1;
}

export function reloadQuery(query: { refetch: () => Promise<unknown> }): Promise<unknown> {
  return query["refetch"]();
}

/** A background read (#408): an in-flight fetch, such as a "더 보기" page, is joined rather than cut off. */
export function pollQuery(query: { refetch: (options: { cancelRefetch: boolean }) => Promise<unknown> }): Promise<unknown> {
  return query["refetch"]({ cancelRefetch: false });
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry },
      mutations: { retry },
    },
  });
}
