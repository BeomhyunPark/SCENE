import { apiRequest } from "./client";

export type OperatorSession = {
  userId: string;
  displayName: string;
};

export function login(body: { userId: string; email?: string }): Promise<OperatorSession> {
  return apiRequest<OperatorSession>("/api/v1/operator/auth/login", {
    method: "POST",
    body,
  });
}

export function getMe(): Promise<OperatorSession> {
  return apiRequest<OperatorSession>("/api/v1/operator/me");
}

export function logout(): Promise<void> {
  return apiRequest<void>("/api/v1/operator/auth/logout", { method: "POST" });
}
