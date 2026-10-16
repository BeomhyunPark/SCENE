import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "./errors";

function retry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry },
      mutations: { retry },
    },
  });
}
